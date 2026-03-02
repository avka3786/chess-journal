import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEPTH = 14;

export async function POST(_req: NextRequest) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Games from last 7 days that haven't been analyzed at depth 14
  const games = await db.game.findMany({
    where: {
      AND: [
        {
          OR: [
            { playedAt: { gte: sevenDaysAgo } },
            { playedAt: null, importedAt: { gte: sevenDaysAgo } },
          ],
        },
        {
          OR: [
            { engineDepth: null },
            { engineDepth: { lt: DEPTH } },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (games.length === 0) {
    return NextResponse.json({ analyzed: 0, skipped: 0, message: "All recent games already analyzed" });
  }

  let analyzed = 0;
  let failed = 0;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  for (const game of games) {
    try {
      const res = await fetch(`${baseUrl}/api/games/${game.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.skipped) continue;
      if (res.ok) analyzed++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ analyzed, failed, total: games.length });
}
