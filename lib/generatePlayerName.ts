import type { CompetitionMode } from "@/lib/worldCup";
import OpenAI from "openai";

export async function generatePlayerName(
  userName: string,
  country: string,
  competitionMode: CompetitionMode = "men"
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const client = new OpenAI({ apiKey });

  const womenExtra =
    competitionMode === "women"
      ? ` Use women's international naming conventions for ${country} — no nicknames or jokes.`
      : "";

  const prompt = `Transform the name "${userName.trim()}" into a realistic footballer name from ${country}.
- Keep it close to the original and recognisable.
- Apply natural naming patterns from ${country} (spelling, suffixes, phonetics).
- Must sound like a real person's name — not a novelty or joke.
- Respond with ONLY the full name. No quotes or explanation.${womenExtra}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 32,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });

  let name = response.choices[0]?.message?.content?.trim() ?? "";
  name = name.replace(/^["'""'']+|["'""'']+$/g, "").trim();
  name = name.replace(/^(full name|name)\s*:\s*/i, "").trim();

  if (!name) throw new Error("No name returned from OpenAI");
  return name;
}
