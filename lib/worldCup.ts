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

/** Favour these nations in random mode when they qualified (70% vs 30% full pool). */
const POPULAR_COUNTRIES = [
  "Brazil",
  "Italy",
  "Germany",
  "Argentina",
  "France",
  "England",
  "Netherlands",
] as const;

export function randomCountryForYear(year: number, mode: CompetitionMode): string {
  const list = table(mode)[String(year)];
  if (!list?.length) throw new Error(`No participant list for year ${year} (${mode})`);
  const popularInYear = POPULAR_COUNTRIES.filter((c) => list.includes(c));
  if (popularInYear.length === 0) {
    return list[Math.floor(Math.random() * list.length)]!;
  }
  if (Math.random() < 0.7) {
    return popularInYear[Math.floor(Math.random() * popularInYear.length)]!;
  }
  return list[Math.floor(Math.random() * list.length)]!;
}

export function randomOutfieldPosition(): OutfieldPosition {
  const i = Math.floor(Math.random() * OUTFIELD_POSITIONS.length);
  return OUTFIELD_POSITIONS[i]!;
}

export function randomPick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}
