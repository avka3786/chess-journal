import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { db } from "@/lib/db";
import {
  fetchChapterPgn,
  tokenizePgn,
  classifyBucket,
} from "@/lib/lichess";

function getHeader(pgn: string, tag: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m?.[1] || undefined;
}

function parsePlayedAt(pgn: string): Date | undefined {
  const raw = getHeader(pgn, "UTCDate") ?? getHeader(pgn, "Date");
  if (!raw || raw.includes("?")) return undefined;
  const [y, mo, d] = raw.split(".");
  const date = new Date(
    `${y}-${(mo ?? "01").padStart(2, "0")}-${(d ?? "01").padStart(2, "0")}`
  );
  return isNaN(date.getTime()) ? undefined : date;
}

export async function POST(req: NextRequest) {
  let body: { studyId?: string; chapterId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { studyId, chapterId } = body;
  if (!studyId || !chapterId) {
    return NextResponse.json(
      { error: "studyId and chapterId are required" },
      { status: 400 }
    );
  }

  // 1. Fetch PGN from Lichess
  let pgn: string;
  try {
    pgn = await fetchChapterPgn(studyId, chapterId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to fetch Lichess chapter: ${msg}` },
      { status: 502 }
    );
  }

  // 2. Extract PGN headers
  const white = getHeader(pgn, "White") ?? "?";
  const black = getHeader(pgn, "Black") ?? "?";
  const result = getHeader(pgn, "Result") ?? "*";
  const timeControl = getHeader(pgn, "TimeControl");
  const eco = getHeader(pgn, "ECO");
  const opening = getHeader(pgn, "Opening") ?? getHeader(pgn, "Event");
  const playedAt = parsePlayedAt(pgn);
  const externalUrl = `https://lichess.org/study/${studyId}/${chapterId}`;

  // 3. Replay moves with chess.js to build fen pairs
  type MoveRow = { ply: number; san: string; fenBefore: string; fenAfter: string };
  let moveRows: MoveRow[] = [];

  try {
    const chess = new Chess();
    const startFen = getHeader(pgn, "FEN");
    if (startFen) {
      chess.load(startFen);
    } else {
      chess.reset();
    }

    // Use the tokenizer to get ordered SANs (strips comments, variations, etc.)
    const tokens = tokenizePgn(pgn);

    for (let i = 0; i < tokens.length; i++) {
      const fenBefore = chess.fen();
      const moved = chess.move(tokens[i].san);
      if (!moved) break; // invalid SAN — stop gracefully
      const fenAfter = chess.fen();
      moveRows.push({ ply: i + 1, san: tokens[i].san, fenBefore, fenAfter });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `PGN parse error: ${msg}` },
      { status: 422 }
    );
  }

  // 4. Classify comments from tokenizer output
  const tokens = tokenizePgn(pgn);
  type AnnotationInput = {
    ply: number;
    bucket: string;
    note: string;
    rawComment: string;
    confidence: number;
  };
  const annotationInputs: AnnotationInput[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const { comment } = tokens[i];
    if (!comment) continue;
    const { bucket, confidence } = classifyBucket(comment);
    annotationInputs.push({
      ply: i + 1,
      bucket,
      note: comment,
      rawComment: comment,
      confidence,
    });
  }

  // 5. Save everything in a transaction
  let gameId: number;
  try {
    const savedGame = await db.$transaction(async (tx) => {
      const game = await tx.game.create({
        data: {
          white,
          black,
          result,
          timeControl,
          eco,
          opening,
          pgn,
          playedAt,
          source: "lichess",
          externalUrl,
        },
      });

      if (moveRows.length > 0) {
        await tx.move.createMany({
          data: moveRows.map((m) => ({ ...m, gameId: game.id })),
        });
      }

      // Insert annotations linked to their move rows
      for (const ann of annotationInputs) {
        const move = await tx.move.findUnique({
          where: { gameId_ply: { gameId: game.id, ply: ann.ply } },
        });
        if (!move) continue;
        await tx.annotation.create({
          data: {
            moveId: move.id,
            bucket: ann.bucket,
            note: ann.note,
            rawComment: ann.rawComment,
            confidence: ann.confidence,
            source: "lichess",
          },
        });
      }

      return game;
    });
    gameId = savedGame.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Lichess save DB error:", msg);
    return NextResponse.json({ error: `DB error: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ gameId });
}
