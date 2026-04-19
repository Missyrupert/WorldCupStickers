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

// Budget settings — change quality to "high" for best results once comfortable with cost.
// low    ≈ $0.011/image  (~470 images on $5)
// medium ≈ $0.042/image  (~120 images on $5)   ← default
// high   ≈ $0.167/image  (~30 images on $5)
const IMAGE_QUALITY = "medium" as "low" | "medium" | "high";
const IMAGE_SIZE = "1024x1024" as const; // square = cheapest; "1024x1536" = portrait but costs ~50% more

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function isOutfieldPosition(s: string): s is OutfieldPosition {
  return (OUTFIELD_POSITIONS as readonly string[]).includes(s);
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey, timeout: 150_000, maxRetries: 1 });

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
    if (image.size > MAX_UPLOAD_BYTES) {
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
    const imageFile = await toFile(Buffer.from(bytes), "photo.png", { type: "image/png" });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    });

    const first = response.data?.[0];
    let b64 = first?.b64_json ?? "";

    if (!b64 && first?.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) throw new Error(`Image URL fetch failed (${imgRes.status})`);
      b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    }

    if (!b64) throw new Error("No image returned from OpenAI");

    setCachedTransform(cacheKey, { imageBase64: b64, mimeType: "image/png" });

    return NextResponse.json({
      imageBase64: b64,
      mimeType: "image/png",
      year, country, position, displayName, mode, competitionMode,
    });

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("transform-image error:", errMsg);

    // Fallback: return original image so sticker UI still renders
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
