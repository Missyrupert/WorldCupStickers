import menParticipants from "@/data/world-cup-participants.json";
import womenParticipants from "@/data/womens-world-cup-participants.json";

export type CompetitionMode = "men" | "women";

export const MENS_WORLD_CUP_YEARS = [
  1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986, 1990,
  1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
] as const;

export const WOMENS_WORLD_CUP_YEARS = [
  1991, 1995, 1999, 2003, 2007, 2011, 2015, 2019, 2023,
] as const;

export type MensWorldCupYear = (typeof MENS_WORLD_CUP_YEARS)[number];
export type WomensWorldCupYear = (typeof WOMENS_WORLD_CUP_YEARS)[number];

/** @deprecated Use MENS_WORLD_CUP_YEARS or getWorldCupYears(mode). */
export const WORLD_CUP_YEARS = MENS_WORLD_CUP_YEARS;

export const OUTFIELD_POSITIONS = ["Defender", "Midfielder", "Forward"] as const;
export type OutfieldPosition = (typeof OUTFIELD_POSITIONS)[number];

const menByYear = menParticipants as Record<string, string[]>;
const womenByYear = womenParticipants as Record<string, string[]>;

export function getWorldCupYears(mode: CompetitionMode): readonly number[] {
  return mode === "women" ? WOMENS_WORLD_CUP_YEARS : MENS_WORLD_CUP_YEARS;
}

function table(mode: CompetitionMode): Record<string, string[]> {
  return mode === "women" ? womenByYear : menByYear;
}

export function isValidYear(year: number, mode: CompetitionMode): boolean {
  return getWorldCupYears(mode).includes(year);
}

export function parseCompetitionMode(raw: string): CompetitionMode | null {
  if (raw === "men" || raw === "women") return raw;
  return null;
}

export function getCountriesForYear(year: number, mode: CompetitionMode): string[] {
  const list = table(mode)[String(year)];
  if (!list) return [];
  return [...list].sort((a, b) => a.localeCompare(b));
}

export function isCountryInYear(
  year: number,
  country: string,
  mode: CompetitionMode
): boolean {
  const list = table(mode)[String(year)];
  return !!list?.includes(country);
}

export const TOP_TEAMS = [
  "Brazil", "Italy", "Germany", "Argentina", "France", "England", "Netherlands",
] as const;

/**
 * Weighted random selection — top teams appear more often but are never guaranteed.
 * generationCount is hashed (golden ratio) to vary the top-team weight each call,
 * preventing any detectable pattern in the output sequence.
 */
export function randomCountryForYear(
  year: number,
  mode: CompetitionMode,
  generationCount: number = 0,
  lastCountry: string = ""
): string {
  const list = table(mode)[String(year)];
  if (!list?.length) throw new Error(`No participant list for year ${year} (${mode})`);

  const topSet = new Set<string>(TOP_TEAMS);

  // Golden-ratio hash of generationCount → weight oscillates between 2.0–4.0
  // with no modulo-style period, so no pattern is visible to users
  const hash = (generationCount * 2654435761) >>> 0;
  const topWeight = 2.0 + (hash / 0xffffffff) * 2.0;

  // Build weighted pool excluding lastCountry (no back-to-back repeat)
  const pool = list
    .filter((c) => c !== lastCountry)
    .map((c) => ({ country: c, weight: topSet.has(c) ? topWeight : 1.0 }));

  // Fallback: if the whole list is just lastCountry, drop the exclusion
  const effective = pool.length > 0
    ? pool
    : list.map((c) => ({ country: c, weight: topSet.has(c) ? topWeight : 1.0 }));

  // Weighted reservoir walk
  const total = effective.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of effective) {
    r -= entry.weight;
    if (r <= 0) return entry.country;
  }

  // Floating-point safety fallback
  return effective[effective.length - 1]!.country;
}

export function randomOutfieldPosition(): OutfieldPosition {
  const i = Math.floor(Math.random() * OUTFIELD_POSITIONS.length);
  return OUTFIELD_POSITIONS[i]!;
}

export function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}
