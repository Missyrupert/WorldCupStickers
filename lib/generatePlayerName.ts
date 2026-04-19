import { requireAnthropicKey } from "@/lib/anthropicKey";
import type { CompetitionMode } from "@/lib/worldCup";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-3-haiku-20240307";

export async function generatePlayerName(
  userName: string,
  country: string,
  competitionMode: CompetitionMode = "men"
): Promise<string> {
  const apiKey = requireAnthropicKey();

  const womenExtra =
    competitionMode === "women"
      ? `\n- Context: FIFA Women's World Cup roster. Use typical women's international naming conventions for ${country.trim()}—no nicknames, stereotypes, or jokes.`
      : "";

  const prompt = `Transform the name "${userName.trim()}" into a realistic footballer name from ${country.trim()}.
- Keep it close to the original — recognisable but culturally adapted.
- Apply natural naming patterns from ${country.trim()} (spelling, suffixes, phonetics).
- Must sound like a real person's name, not a novelty or joke.
- Avoid exaggeration. Avoid generic or overly common names.
- Respond with ONLY the full name. No quotes, punctuation, or explanation.${womenExtra}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 64,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const rawBody = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Anthropic returned non-JSON (${response.status}): ${rawBody.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ??
      rawBody.slice(0, 300);
    throw new Error(`Anthropic API error (${response.status}): ${errMsg}`);
  }

  const firstBlock = (
    data as { content?: { type?: string; text?: string }[] }
  )?.content?.[0];

  if (!firstBlock || firstBlock.type !== "text" || !firstBlock.text?.trim()) {
    throw new Error("Anthropic returned no text content");
  }

  let name = firstBlock.text.trim();
  name = name.replace(/^["'""'']+|["'""'']+$/g, "").trim();
  name = name.replace(/^(full name|name)\s*:\s*/i, "").trim();

  if (!name) throw new Error("Transformed name was empty after parsing");

  return name;
}
