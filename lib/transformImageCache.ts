import { createHash } from "node:crypto";

const CACHE_MAX = 32;
const cache = new Map<string, { imageBase64: string; mimeType: string }>();

export function makeTransformCacheKey(
  imageBytes: ArrayBuffer,
  year: number,
  country: string,
  competitionMode: string
): string {
  const hash = createHash("sha256").update(new Uint8Array(imageBytes)).digest("hex");
  return `${hash}|${year}|${country}|${competitionMode}`;
}

export function getCachedTransform(key: string): { imageBase64: string; mimeType: string } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedTransform(
  key: string,
  value: { imageBase64: string; mimeType: string }
): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
}
