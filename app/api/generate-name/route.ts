import { generatePlayerName } from "@/lib/generatePlayerName";
import { parseCompetitionMode, type CompetitionMode } from "@/lib/worldCup";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userName?: string;
      country?: string;
      competitionMode?: string;
    };
    const userName = typeof body.userName === "string" ? body.userName : "";
    const country = typeof body.country === "string" ? body.country : "";
    let competitionMode: CompetitionMode = "men";
    if (body.competitionMode != null && String(body.competitionMode).trim() !== "") {
      const parsed = parseCompetitionMode(String(body.competitionMode).trim());
      if (!parsed) {
        return NextResponse.json(
          { error: "competitionMode must be 'men' or 'women'" },
          { status: 400 }
        );
      }
      competitionMode = parsed;
    }

    if (!userName.trim()) {
      return NextResponse.json({ error: "userName is required" }, { status: 400 });
    }
    if (!country.trim()) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
    }

    const name = await generatePlayerName(userName, country, competitionMode);
    return NextResponse.json({ name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
