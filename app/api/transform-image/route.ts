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

// img2img with LOW strength = identity preserved, only clothing + background change
const MODEL = "stability-ai/sdxl";
const PROMPT_STRENGTH = 0.25;
const GUIDANCE_SCALE = 7.5;
const STEPS = 25;
const TIMEOUT_MS = 55_000;

const NEGATIVE_PROMPT =
  "different face, changed identity, altered facial features, face replacement, " +
  "beautified, smoothed skin, cartoon, painting, illustration, anime, deformed, " +
  "unrealistic, different person, bad quality, watermark";

function isOutfieldPosition(s: string): s is OutfieldPosition {
  return (OUTFIELD_POSITIONS as readonly string[]).includes(s);
}

async function runModel(
  replicate: Replicate,
  imageDataUrl: string,
  prompt: string
): Promise<string> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS)
  );

  const output = await Promise.race([
    replicate.run(MODEL, {
      input: {
        image: imageDataUrl,
        prompt,
        negative_prompt: NEGATIVE_PROMPT,
        prompt_strength: PROMPT_STRENGTH,
        num_inference_steps: STEPS,
        guidance_scale: GUIDANCE_SCALE,
        width: 768,
        height: 1024,
        num_outputs: 1,
        apply_watermark: false,
      },
    }),
    timeout,
  ]);

  const url =
    typeof output === "string" ? output :
    Array.isArray(output) && output.length > 0 ? String(output[0]) :
    String(output);

  if (!url) throw new Error("No image URL returned from Replicate");
  return url;
}

export async function POST(req: Request) {
  const apiToken = process.env.REPLICATE_API_TOKEN?.trim();
  if (!apiToken) {
    return NextResponse.json({ error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  const replicate = new Replicate({ auth: apiToken });

  // Parsed early so fallback can echo them back
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
    const imageDataUrl = `data:image/jpeg;base64,${originalB64}`;

    // Try once, retry once on failure
    let b64: string | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = await runModel(replicate, imageDataUrl, prompt);
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error(`Image fetch failed (${imgRes.status})`);
        b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
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
    console.error("transform-image error:", e);

    // Fallback: return original image so the sticker UI still renders
    if (originalB64) {
      return NextResponse.json({
        imageBase64: originalB64,
        mimeType: "image/jpeg",
        year, country, position, displayName, mode, competitionMode,
        fallback: true,
      });
    }

    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
