import { Buffer } from "node:buffer";
import { buildTransformImagePrompt } from "@/lib/transformImagePrompt";
import {
  getCachedTransform,
  makeTransformCacheKey,
  setCachedTransform,
} from "@/lib/transformImageCache";
import {
  isCountryInYear,
  isValidYear,
  OUTFIELD_POSITIONS,
  parseCompetitionMode,
  type CompetitionMode,
  type OutfieldPosition,
} from "@/lib/worldCup";
import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

// instruct-pix2pix: battle-tested img2img on Replicate, accepts Blob file uploads.
// image_guidance_scale controls identity preservation (higher = more faithful to original).
const MODEL = "timothybrooks/instruct-pix2pix";
const IMAGE_GUIDANCE_DEFAULT = 2.0; // faithful to original face
const IMAGE_GUIDANCE_RETRY   = 1.5; // adaptive: allow more change if first run was unchanged
const TEXT_GUIDANCE = 7.5;
const STEPS = 20;
const TIMEOUT_MS = 55_000;
const MIN_TRANSFORMED_BYTES = 80_000; // pix2pix output < 80KB = likely unchanged

function isOutfieldPosition(s: string): s is OutfieldPosition {
  return (OUTFIELD_POSITIONS as readonly string[]).includes(s);
}

/** Pull retry_after seconds out of a Replicate 429 error message. */
function parseRetryAfter(errMsg: string): number {
  try {
    const match = errMsg.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { retry_after?: number };
      if (typeof parsed.retry_after === "number") return parsed.retry_after;
    }
  } catch { /* ignore */ }
  return 10; // safe default
}

function is429(errMsg: string): boolean {
  return errMsg.includes("429");
}

async function runModel(
  replicate: Replicate,
  imageBlob: Blob,
  prompt: string,
  imageGuidance: number
): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out after 55s")), TIMEOUT_MS)
  );

  const output = await Promise.race([
    replicate.run(MODEL, {
      input: {
        image: imageBlob,
        prompt,
        num_inference_steps: STEPS,
        image_guidance_scale: imageGuidance,
        guidance_scale: TEXT_GUIDANCE,
      },
    }),
    timeout,
  ]);

  const url =
    typeof output === "string" ? output :
    Array.isArray(output) && output.length > 0 ? String(output[0]) :
    String(output);

  if (!url || url === "undefined") throw new Error("No image URL returned from Replicate");
  return url;
}

export async function POST(req: Request) {
  const apiToken = process.env.REPLICATE_API_TOKEN?.trim();
  if (!apiToken) {
    return NextResponse.json({ error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  const replicate = new Replicate({ auth: apiToken });

  let year = 0;
  let country = "";
  let position: OutfieldPosition = "Midfielder";
  let displayName = "";
  let mode = "";
  let competitionMode: CompetitionMode = "men";
  let originalB64 = "";

  try {
    const form = await req.formData();

    const image = form.get("image");
    if (!image || !(image instanceof File) || image.size === 0) {
      return new Response("No image provided", { status: 400 });
    }
    if (image.size > 10 * 1024 * 1024) {
      return new Response("Image too large (max 10 MB)", { status: 400 });
    }

    mode = String(form.get("mode") ?? "");
    if (mode !== "custom" && mode !== "random") {
      return NextResponse.json({ error: "mode must be 'custom' or 'random'" }, { status: 400 });
    }

    const competitionField = form.get("competitionMode");
    if (competitionField != null && String(competitionField).trim() !== "") {
      const parsed = parseCompetitionMode(String(competitionField).trim());
      if (!parsed) {
        return NextResponse.json({ error: "competitionMode must be 'men' or 'women'" }, { status: 400 });
      }
      competitionMode = parsed;
    }

    year = Number(form.get("year"));
    if (!isValidYear(year, competitionMode)) {
      return NextResponse.json({ error: "Invalid tournament year" }, { status: 400 });
    }

    const userName = String(form.get("userName") ?? "").trim();
    if (!userName) {
      return NextResponse.json({ error: "userName is required" }, { status: 400 });
    }

    country = String(form.get("country") ?? "").trim();
    const pos = String(form.get("position") ?? "").trim();

    if (!country) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
    }
    if (!isCountryInYear(year, country, competitionMode)) {
      return NextResponse.json({
        error: `${country} did not participate in the ${year} ${
          competitionMode === "women" ? "FIFA Women's World Cup" : "FIFA World Cup"
        }`,
      }, { status: 400 });
    }
    if (!isOutfieldPosition(pos)) {
      return NextResponse.json(
        { error: "position must be Defender, Midfielder, or Forward" },
        { status: 400 }
      );
    }

    position = pos;
    displayName = mode === "custom" ? userName : "";

    const bytes = await image.arrayBuffer();
    originalB64 = Buffer.from(bytes).toString("base64");

    const cacheKey = makeTransformCacheKey(bytes, year, country, competitionMode);
    const cached = getCachedTransform(cacheKey);
    if (cached) {
      return NextResponse.json({
        imageBase64: cached.imageBase64,
        mimeType: cached.mimeType,
        year, country, position, displayName, mode, competitionMode,
      });
    }

    const prompt = buildTransformImagePrompt(year, country, competitionMode);
    // Pass as Blob — Replicate SDK uploads it properly, avoids data URL rejection
    const imageBlob = new Blob([bytes], { type: "image/jpeg" });

    let b64: string | null = null;
    let lastError: unknown;

    const guidanceValues = [IMAGE_GUIDANCE_DEFAULT, IMAGE_GUIDANCE_RETRY] as const;
    for (let attempt = 0; attempt < guidanceValues.length; attempt++) {
      try {
        const url = await runModel(replicate, imageBlob, prompt, guidanceValues[attempt]!);
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error(`Image fetch failed (${imgRes.status})`);
        const buf = Buffer.from(await imgRes.arrayBuffer());

        if (attempt === 0 && buf.length < MIN_TRANSFORMED_BYTES) {
          lastError = new Error("Model returned unchanged image");
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        b64 = buf.toString("base64");
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          const msg = err instanceof Error ? err.message : String(err);
          const waitMs = is429(msg)
            ? (parseRetryAfter(msg) + 1) * 1000  // honour Replicate's retry_after
            : 1500;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }

    if (!b64) throw lastError;

    setCachedTransform(cacheKey, { imageBase64: b64, mimeType: "image/png" });

    return NextResponse.json({
      imageBase64: b64,
      mimeType: "image/png",
      year, country, position, displayName, mode, competitionMode,
    });

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("transform-image error:", errMsg);

    // Fallback: return original image so the sticker UI still renders.
    // Include the actual error so the UI can surface it for debugging.
    if (originalB64) {
      return NextResponse.json({
        imageBase64: originalB64,
        mimeType: "image/jpeg",
        year, country, position, displayName, mode, competitionMode,
        fallback: true,
        fallbackReason: errMsg,
      });
    }

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
