import type { CompetitionMode } from "@/lib/worldCup";

// SD img2img works best with short positive prompts describing what SHOULD be in the image.
// Identity preservation is handled by prompt_strength: 0.25 — NOT by prompt instructions.

export function buildTransformImagePrompt(
  year: number,
  country: string,
  competitionMode: CompetitionMode
): string {
  const comp = competitionMode === "women" ? "women's" : "men's";
  return (
    `Professional footballer wearing the ${country} ${comp} national team kit from ${year}, ` +
    `football stadium background, press photograph, photorealistic, natural lighting, same person`
  );
}
