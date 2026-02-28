import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { db } from "@/lib/db";

/** Split a multi-game PGN export into individual game strings. */
function splitPgns(text: string): string[] {
  // Each game starts with a tag section ([...] lines).
  // chess.com separates games with a blank line before the next tag section.
  // Split on blank lines that precede a new tag section, then re-join
  // each header block with its following move text block.
  const chunks = text.trim().split(/\n\n+(?=\[)/);
  return chunks
    .reduce<string[]>((acc, chunk) => {
      if (chunk.startsWith("[")) {
        acc.push(chunk);
      } else if (acc.length > 0) {
        acc[acc.length - 1] += "\n\n" + chunk;
      }
      return acc;
    }, [])
    .filter((g) => g.includes("["));
}

function getHeader(pgn: string, tag: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m?.[1] || undefined;
}

function parsePlayedAt(pgn: string): Date | undefined {
  const raw = getHeader(pgn, "UTCDate") ?? getHeader(pgn, "Date");
  if (!raw || raw.includes("?")) return undefined;
  const [y, mo, d] = raw.split(".");
  const date = new Date(`${y}-${(mo ?? "01").padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}`);
  return isNaN(date.getTime()) ? undefined : date;
}

export async function POST(req: NextRequest) {
  let body: { pgn?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPgn = body.pgn?.trim();
  if (!rawPgn) {
    return NextResponse.json({ error: "No PGN provided" }, { status: 400 });
  }

  const pgnBlocks = splitPgns(rawPgn);
  if (pgnBlocks.length === 0) {
    return NextResponse.json({ error: "No valid games found in PGN" }, { status: 400 });
  }

  const results = { imported: 0, failed: 0, errors: [] as string[] };

  for (const pgn of pgnBlocks) {
    const white = getHeader(pgn, "White") ?? "Unknown";
    const black = getHeader(pgn, "Black") ?? "Unknown";
    const result = getHeader(pgn, "Result") ?? "*";
    const timeControl = getHeader(pgn, "TimeControl");
    const eco = getHeader(pgn, "ECO");
    const opening = getHeader(pgn, "Opening");
    const playedAt = parsePlayedAt(pgn);

    type MoveRow = { ply: number; san: string; fenBefore: string; fenAfter: string };
    let moveRows: MoveRow[] = [];
    let parseError: string | undefined;

    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history();

      // Replay from the start to capture fenBefore/fenAfter for each ply.
      const startFen = getHeader(pgn, "FEN");
      if (startFen) {
        chess.load(startFen);
      } else {
        chess.reset();
      }

      for (let i = 0; i < history.length; i++) {
        const fenBefore = chess.fen();
        chess.move(history[i]);
        const fenAfter = chess.fen();
        moveRows.push({ ply: i + 1, san: history[i], fenBefore, fenAfter });
      }
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
      console.error(`Move parse error for ${white} vs ${black}:`, parseError);
    }

    try {
      await db.$transaction(async (tx) => {
        const game = await tx.game.create({
          data: { white, black, result, timeControl, eco, opening, pgn, playedAt },
        });
        if (moveRows.length > 0) {
          await tx.move.createMany({
            data: moveRows.map((m) => ({ ...m, gameId: game.id })),
          });
        }
      });

      if (parseError) {
        results.errors.push(`${white} vs ${black}: ${parseError}`);
        results.failed++;
      } else {
        results.imported++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("DB insert error:", msg);
      results.errors.push(`DB error for ${white} vs ${black}: ${msg}`);
      results.failed++;
    }
  }

  return NextResponse.json(results);
}
