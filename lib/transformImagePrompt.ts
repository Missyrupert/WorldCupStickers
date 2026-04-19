import type { CompetitionMode } from "@/lib/worldCup";

const MEN_TEMPLATE = `Edit the provided image.

FACE — STRICTLY LOCKED:
The face must remain identical to the original person in every detail. Do not reinterpret, enhance, stylise, or modify any facial feature. Preserve natural skin texture, pores, wrinkles, stubble, and all imperfections exactly as they appear. Do not smooth, soften, or retouch. The face must look like an unretouched documentary photograph of the same person.

LIGHTING:
Do not apply cinematic lighting, dramatic shadows, beauty lighting, or modern portrait effects. Use simple, natural light consistent with documentary sports photography of {{YEAR}}.

KIT — HISTORICALLY ACCURATE:
Dress the person in the {{COUNTRY}} men's national football kit exactly as it appeared in {{YEAR}}. Use the correct base colour, collar style (V-neck, crew, buttoned, etc.), sleeve cut, badge position, and any era-specific trim or pattern. Avoid modern synthetic textures, sponsor logos, or design elements that did not exist in {{YEAR}}. Pre-1980 kits should be simple and classic.

BACKGROUND:
Replace with a football stadium scene from {{YEAR}}. Match era-appropriate stadium architecture, floodlights, crowd, and atmosphere.

PHOTOGRAPHIC QUALITY:
Apply subtle print characteristics matching {{YEAR}}: very light film grain, minimal vignette at edges, slight colour softness, faint printed-paper feel. For years before 1986, soften focus slightly and increase colour fading to match film photography of the time. Keep all effects understated and realistic — not filtered or stylised.

FINAL CHECK:
The result must look like a real archival press photograph of this specific person taken in {{YEAR}} as a professional footballer. Photorealistic. Natural. Not AI-generated.`;

const WOMEN_TEMPLATE = `Edit the provided image.

FACE — STRICTLY LOCKED:
The face must remain identical to the original person in every detail. Do not reinterpret, enhance, stylise, or modify any facial feature. Preserve natural skin texture, pores, wrinkles, and all imperfections exactly as they appear. Do not smooth, soften, or retouch. Do not change gender presentation or apply any stereotype-based modifications.

LIGHTING:
Do not apply cinematic lighting, dramatic shadows, or modern portrait effects. Use simple, natural light consistent with documentary sports photography of {{YEAR}}.

KIT — HISTORICALLY ACCURATE:
Dress the person in the {{COUNTRY}} women's national football kit exactly as it appeared in {{YEAR}}. Use the correct base colour, collar style, sleeve cut, badge position, and era-specific details from women's international football of that period.

BACKGROUND:
Replace with a football stadium scene from {{YEAR}} — era-appropriate architecture, lighting, and crowd.

PHOTOGRAPHIC QUALITY:
Apply subtle print characteristics: very light film grain, minimal vignette, slight colour softness. Keep effects understated and realistic.

FINAL CHECK:
The result must look like a real archival press photograph of this specific person taken in {{YEAR}} as a professional footballer. Photorealistic. Natural. Not AI-generated.`;

export function buildTransformImagePrompt(
  year: number,
  country: string,
  competitionMode: CompetitionMode
): string {
  const YEAR = String(year);
  const COUNTRY = country.trim();
  const template = competitionMode === "women" ? WOMEN_TEMPLATE : MEN_TEMPLATE;
  return template.replaceAll("{{YEAR}}", YEAR).replaceAll("{{COUNTRY}}", COUNTRY);
}
