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
const IMAGE_SIZE = "1024x1024" as const;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ── Rate limiting (in-memory — resets on server restart / cold start) ──────
// Good enough for a fun viral app; swap for Redis if you need hard guarantees.

const WINDOW_MS = 24 * 60 * 60 * 1000;

// Per-IP: max 5 successful generations per rolling 24h window
const IP_MAX = 5;
type IpRecord = { count: number; since: number };
const ipMap = new Map<string, IpRecord>();

// Global: max 500 successful generations per day (cost safety switch)
const GLOBAL_MAX = 500;
let globalCount = 0;
let globalWindowStart = Date.now();

function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isIpLimited(ip: string): boolean {
  const r = ipMap.get(ip);
  if (!r) return false;
  if (Date.now() - r.since > WINDOW_MS) { ipMap.delete(ip); return false; }
  return r.count >= IP_MAX;
}

function incrementIp(ip: string): void {
  const r = ipMap.get(ip);
  if (!r || Date.now() - r.since > WINDOW_MS) {
    ipMap.set(ip, { count: 1, since: Date.now() });
  } else {
    ipMap.set(ip, { count: r.count + 1, since: r.since });
  }
}

function isGlobalLimited(): boolean {
  if (Date.now() - globalWindowStart > WINDOW_MS) {
    globalCount = 0;
    globalWindowStart = Date.now();
  }
  return globalCount >= GLOBAL_MAX;
}

function incrementGlobal(): void {
  if (Date.now() - globalWindowStart > WINDOW_MS) {
    globalCount = 1;
    globalWindowStart = Date.now();
  } else {
    globalCount++;
  }
}
// ──────────────────────────────────────────────────────────────────────────

function isOutfieldPosition(s: string): s is OutfieldPosition {
  return (OUTFIELD_POSITIONS as readonly string[]).includes(s);
}

export async function POST(req: Request) {
  // Rate limit checks — before any expensive work
  const ip = getIp(req);
  if (isGlobalLimited()) {
    return NextResponse.json(
      { error: "High demand right now — try again later" },
      { status: 429 }
    );
  }
  if (isIpLimited(ip)) {
    return NextResponse.json(
      { error: "High demand — try again later" },
      { status: 429 }
    );
  }

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

    // Only count genuine successful transformations
    incrementIp(ip);
    incrementGlobal();

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
