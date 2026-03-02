import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { StockfishEngine } from "@/lib/stockfish";
import { classifyMotif } from "@/lib/motifs";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for long games

const DEPTH = 14;
const MISTAKE_THRESHOLD_CP = 150;
const MY_USERNAME = "avka3786";

function detectHeroColor(white: string, black: string): "white" | "black" | null {
  if (white.toLowerCase() === MY_USERNAME) return "white";
  if (black.toLowerCase() === MY_USERNAME) return "black";
  return null;
}

function isMyPly(ply: number, heroColor: "white" | "black"): boolean {
  return heroColor === "white" ? ply % 2 === 1 : ply % 2 === 0;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid game id" }, { status: 400 });

  let force = false;
  try { force = (await req.json()).force === true; } catch { /* no body */ }

  const game = await db.game.findUnique({
    where: { id },
    include: { moves: { orderBy: { ply: "asc" } } },
  });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  if (!force && (game.engineDepth ?? 0) >= DEPTH) {
    return NextResponse.json({ skipped: true, reason: "Already analyzed at depth 14" });
  }

  if (game.moves.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No moves" });
  }

  // Determine heroColor — prefer stored, fall back to username detection
  const heroColor =
    (game.heroColor as "white" | "black" | null) ??
    detectHeroColor(game.white, game.black);

  // ── Run Stockfish on every move ────────────────────────────────────────────
  const engine = new StockfishEngine();
  try {
    await engine.init();
  } catch (e) {
    engine.quit();
    return NextResponse.json(
      { error: `Stockfish failed to start: ${e instanceof Error ? e.message : e}` },
      { status: 503 }
    );
  }

  type EvalRow = {
    moveId: number;
    ply: number;
    depth: number;
    evalCp: number | null;
    evalMate: number | null;
    bestMoveUci: string | null;
    pvUci: string | null;
  };
  const evalRows: EvalRow[] = [];

  try {
    for (const move of game.moves) {
      const result = await engine.analyze(move.fenBefore, DEPTH);
      evalRows.push({
        moveId: move.id,
        ply: move.ply,
        depth: result.depth,
        evalCp: result.evalCp,
        evalMate: result.evalMate,
        bestMoveUci: result.bestMoveUci,
        pvUci: result.pvUci,
      });
    }
  } finally {
    engine.quit();
  }

  // ── Persist EngineEvals ─────────────────────────────────────────────────────
  await db.$transaction(async (tx) => {
    for (const row of evalRows) {
      await tx.engineEval.upsert({
        where: { moveId: row.moveId },
        create: {
          moveId: row.moveId,
          depth: row.depth,
          evalCp: row.evalCp,
          evalMate: row.evalMate,
          bestMoveUci: row.bestMoveUci,
          pvUci: row.pvUci,
        },
        update: {
          depth: row.depth,
          evalCp: row.evalCp,
          evalMate: row.evalMate,
          bestMoveUci: row.bestMoveUci,
          pvUci: row.pvUci,
        },
      });
    }
    // Store heroColor if newly detected
    await tx.game.update({
      where: { id },
      data: {
        engineReviewedAt: new Date(),
        engineDepth: DEPTH,
        heroColor: game.heroColor ?? heroColor,
      },
    });
  });

  // ── Detect mistakes + classify motifs ──────────────────────────────────────
  let findingsCreated = 0;

  if (heroColor) {
    const evalByPly = new Map(evalRows.map((r) => [r.ply, r]));

    for (const move of game.moves) {
      if (!isMyPly(move.ply, heroColor)) continue;

      const evalBefore = evalByPly.get(move.ply);
      const evalAfter = evalByPly.get(move.ply + 1); // position after my move
      if (!evalBefore || !evalAfter) continue;

      // Compute swing (White perspective)
      let swingCp: number | null = null;
      let swingMate: number | null = null;

      if (evalBefore.evalMate !== null || evalAfter.evalMate !== null) {
        // Mate swing — always a serious mistake
        swingMate = (evalAfter.evalMate ?? 0) - (evalBefore.evalMate ?? 0);
      } else if (evalBefore.evalCp !== null && evalAfter.evalCp !== null) {
        swingCp = evalAfter.evalCp - evalBefore.evalCp;
      }

      // Check if this qualifies as a mistake
      const isMistake =
        swingMate !== null ||
        (swingCp !== null &&
          (heroColor === "white" ? swingCp <= -MISTAKE_THRESHOLD_CP
                                 : swingCp >= MISTAKE_THRESHOLD_CP));

      if (!isMistake) continue;

      const motifResult = classifyMotif({
        fenBefore: move.fenBefore,
        bestMoveUci: evalBefore.bestMoveUci ?? "a1a1",
        pvUci: evalBefore.pvUci,
        evalMate: evalBefore.evalMate,
        evalCp: evalBefore.evalCp,
        swingCp,
      });

      await db.finding.upsert({
        where: { moveId: move.id },
        create: {
          moveId: move.id,
          swingCp,
          swingMate,
          motif: motifResult.motif,
          confidence: motifResult.confidence,
          reason: motifResult.reason,
        },
        update: {
          swingCp,
          swingMate,
          motif: motifResult.motif,
          confidence: motifResult.confidence,
          reason: motifResult.reason,
        },
      });
      findingsCreated++;
    }
  }

  return NextResponse.json({
    analyzedMoves: evalRows.length,
    findingsCreated,
    heroColor,
  });
}
