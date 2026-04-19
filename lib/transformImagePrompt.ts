import type { CompetitionMode } from "@/lib/worldCup";

// gpt-image-1 is an instruction-following model.
// Short, imperative, structured prompts outperform long paragraphs.
// Sections: what to lock → what to change → quality target.

export function buildTransformImagePrompt(
  year: number,
  country: string,
  competitionMode: CompetitionMode
): string {
  const comp = competitionMode === "women" ? "women's" : "men's";
  const era = year < 1986 ? " Use soft film-era colours and slight grain to match the period." : "";

  return `Edit this photo.

LOCK — do not change under any circumstances:
- This person's face, identity, skin texture, and all physical features
- No smoothing, beautifying, or altering of the face

CHANGE ONLY:
- Clothing: replace with the ${country} ${comp} national football kit from ${year}. Use historically accurate colours, collar style, and design for that era. No modern reinterpretations.
- Background: replace with a football stadium from ${year}, era-appropriate.
- Lighting: natural stadium lighting matching ${year}.${era}

The result must look like a real press photograph of the same person in ${year}. Photorealistic. No stylisation.`;
}
