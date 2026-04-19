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
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function isOutfieldPosition(s: string): s is OutfieldPosition {
  return (OUTFIELD_POSITIONS as readonly string[]).includes(s);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }

    const openai = new OpenAI({ apiKey, timeout: 150_000, maxRetries: 1 });

    const form = await req.formData();

    const image = form.get("image");
    if (!image || !(image instanceof File) || image.size === 0) {
      return new Response("No image provided", { status: 400 });
    }
    if (image.size > MAX_UPLOAD_BYTES) {
      return new Response("Image too large (max 10 MB)", { status: 400 });
    }

    const mode = String(form.get("mode") ?? "");
    if (mode !== "custom" && mode !== "random") {
      return NextResponse.json({ error: "mode must be 'custom' or 'random'" }, { status: 400 });
    }

    const competitionField = form.get("competitionMode");
    let competitionMode: CompetitionMode = "men";
    if (competitionField != null && String(competitionField).trim() !== "") {
      const parsed = parseCompetitionMode(String(competitionField).trim());
      if (!parsed) {
        return NextResponse.json(
          { error: "competitionMode must be 'men' or 'women'" },
          { status: 400 }
        );
      }
      competitionMode = parsed;
    }

    const year = Number(form.get("year"));
    if (!isValidYear(year, competitionMode)) {
      return NextResponse.json(
        { error: "Invalid tournament year for the selected competition" },
        { status: 400 }
      );
    }

    const userName = String(form.get("userName") ?? "").trim();
    if (!userName) {
      return NextResponse.json({ error: "userName is required" }, { status: 400 });
    }

    const country = String(form.get("country") ?? "").trim();
    const pos = String(form.get("position") ?? "").trim();

    if (!country) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
    }
    if (!isCountryInYear(year, country, competitionMode)) {
      return NextResponse.json(
        {
          error: `${country} did not participate in the ${year} ${
            competitionMode === "women" ? "FIFA Women's World Cup" : "FIFA World Cup"
          }`,
        },
        { status: 400 }
      );
    }
    if (!isOutfieldPosition(pos)) {
      return NextResponse.json(
        { error: "position must be Defender, Midfielder, or Forward" },
        { status: 400 }
      );
    }

    const position: OutfieldPosition = pos;
    const displayName = mode === "custom" ? userName : "";
    const prompt = buildTransformImagePrompt(year, country, competitionMode);

    const bytes = await image.arrayBuffer();
    const cacheKey = makeTransformCacheKey(bytes, year, country, competitionMode);
    const cached = getCachedTransform(cacheKey);

    let b64: string;

    if (cached) {
      b64 = cached.imageBase64;
    } else {
      const imageFile = await toFile(Buffer.from(bytes), "photo.png", { type: "image/png" });

      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt,
      });

      const first = response.data?.[0];
      let imageBase64 = first?.b64_json ?? "";

      if (!imageBase64 && first?.url) {
        const imgRes = await fetch(first.url);
        if (!imgRes.ok) {
          throw new Error(`Failed to fetch image URL: ${imgRes.status}`);
        }
        imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
      }

      if (!imageBase64) {
        throw new Error("No image returned from OpenAI");
      }

      b64 = imageBase64;
      setCachedTransform(cacheKey, { imageBase64: b64, mimeType: "image/png" });
    }

    return NextResponse.json({
      imageBase64: b64,
      mimeType: "image/png",
      year,
      country,
      position,
      displayName,
      mode,
      competitionMode,
    });
  } catch (e) {
    console.error("transform-image error:", e);
    const message = e instanceof Error ? e.message : "Server error";
    const isTimeout =
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("timed out");
    return NextResponse.json(
      { error: isTimeout ? "Image generation timed out. Please try again." : message },
      { status: 500 }
    );
  }
}
