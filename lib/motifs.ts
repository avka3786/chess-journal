import { Chess, Color, PieceSymbol, Square } from "chess.js";

export type MotifKey =
  | "MATE_IN_1" | "MATE_IN_2" | "BACK_RANK_MATE"
  | "HANGING_PIECE" | "FORK" | "PIN" | "SKEWER"
  | "DISCOVERED_ATTACK" | "DISCOVERED_CHECK"
  | "DEFLECTION" | "ATTRACTION" | "INTERMEZZO"
  | "TRAPPED_PIECE" | "DEFENSIVE_MOVE" | "QUIET_MOVE";

export type MotifResult = { motif: MotifKey; confidence: number; reason: string };

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100, n: 300, b: 320, r: 500, q: 900, k: 99999,
};

function uciToMove(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

/** All squares attacked by a piece colour. */
function attackedSquares(chess: Chess, color: Color): Set<Square> {
  const attacked = new Set<Square>();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = (String.fromCharCode(97 + f) + (r + 1)) as Square;
      if (chess.isAttacked(sq, color)) attacked.add(sq);
    }
  }
  return attacked;
}

/** Squares occupied by opponent pieces with value >= minValue. */
function valuableSquares(chess: Chess, opponentColor: Color, minValue: number): Square[] {
  const squares: Square[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = (String.fromCharCode(97 + f) + (r + 1)) as Square;
      const p = chess.get(sq);
      if (p && p.color === opponentColor && PIECE_VALUE[p.type] >= minValue) {
        squares.push(sq);
      }
    }
  }
  return squares;
}

/** Check if the king's back rank is boxed by own pawns (back-rank weakness). */
function isBackRankWeak(chess: Chess, color: Color): boolean {
  const backRank = color === "w" ? 1 : 8;
  const kingSquare = chess.board().flat().find(
    (p) => p && p.type === "k" && p.color === color
  )?.square as Square | undefined;
  if (!kingSquare) return false;
  const kFile = kingSquare.charCodeAt(0) - 97;
  // Check squares adjacent to king on back rank — if all 3 escape squares are blocked by own pawns
  let blocked = 0;
  for (const df of [-1, 0, 1]) {
    const f = kFile + df;
    if (f < 0 || f > 7) { blocked++; continue; }
    const escapeSq = (String.fromCharCode(97 + f) +
      (color === "w" ? 2 : 7)) as Square;
    const p = chess.get(escapeSq);
    if (p && p.color === color && p.type === "p") blocked++;
  }
  return blocked >= 2;
}

export function classifyMotif(params: {
  fenBefore: string;
  bestMoveUci: string;
  pvUci: string | null;
  evalMate: number | null;
  evalCp: number | null;
  swingCp: number | null;
}): MotifResult {
  const { fenBefore, bestMoveUci, pvUci, evalMate, swingCp } = params;

  // ── 1. Mate-based motifs ───────────────────────────────────────────────────
  if (evalMate !== null) {
    const abs = Math.abs(evalMate);

    if (abs === 1) {
      try {
        const chess = new Chess(fenBefore);
        const mv = uciToMove(bestMoveUci);
        const result = chess.move(mv);
        if (result && chess.isCheckmate()) {
          const toRank = parseInt(mv.to[1], 10);
          if ((toRank === 1 || toRank === 8) &&
              (result.piece === "r" || result.piece === "q") &&
              isBackRankWeak(chess, chess.turn() === "w" ? "b" : "w" as Color)) {
            return { motif: "BACK_RANK_MATE", confidence: 95, reason: `Back-rank mate: ${bestMoveUci}` };
          }
          return { motif: "MATE_IN_1", confidence: 95, reason: `Mate in 1: ${bestMoveUci}` };
        }
      } catch { /* illegal move in test FEN; still MATE_IN_1 from eval */ }
      return { motif: "MATE_IN_1", confidence: 90, reason: `Mate in 1: ${bestMoveUci}` };
    }

    if (abs === 2) {
      return { motif: "MATE_IN_2", confidence: 85, reason: `Mate in 2 starting ${bestMoveUci}` };
    }
  }

  // Load board for tactical analysis
  let chess: Chess;
  try { chess = new Chess(fenBefore); }
  catch { return { motif: "QUIET_MOVE", confidence: 10, reason: "Could not parse FEN" }; }

  const mv = uciToMove(bestMoveUci);
  const myColor = chess.turn();
  const oppColor: Color = myColor === "w" ? "b" : "w";

  const pieceBefore = chess.get(mv.from);
  if (!pieceBefore) return { motif: "QUIET_MOVE", confidence: 10, reason: "No piece at source" };

  const captured = chess.get(mv.to);
  const capValue = captured ? PIECE_VALUE[captured.type] : 0;
  const ownValue = PIECE_VALUE[pieceBefore.type];

  // ── 2. Hanging piece ──────────────────────────────────────────────────────
  if (captured) {
    // Piece is hanging if it's undefended by opponent
    const tempChess = new Chess(fenBefore);
    const isHanging = !tempChess.isAttacked(mv.to, oppColor);
    if (isHanging || capValue > ownValue) {
      const conf = isHanging ? 85 : 70;
      return {
        motif: "HANGING_PIECE",
        confidence: conf,
        reason: `Hanging ${captured.type.toUpperCase()} on ${mv.to}: ${bestMoveUci} wins material`,
      };
    }
  }

  // Make the best move and examine resulting position
  let result;
  try { result = chess.move(mv); }
  catch { return { motif: "QUIET_MOVE", confidence: 10, reason: "Illegal best move" }; }

  // ── 3. Fork ───────────────────────────────────────────────────────────────
  {
    const attacked = attackedSquares(chess, myColor);
    const targets = valuableSquares(chess, oppColor, 300).filter((sq) => attacked.has(sq));
    if (targets.length >= 2) {
      const pieces = targets.map((sq) => chess.get(sq)?.type.toUpperCase()).join("+");
      return {
        motif: "FORK",
        confidence: 80,
        reason: `Fork: ${bestMoveUci} attacks ${pieces} simultaneously`,
      };
    }
  }

  // ── 4. Discovered check / attack ──────────────────────────────────────────
  if (result && result.flags.includes("c")) {
    // Check came from a piece other than the moved piece → discovered check
    const movedPiece = chess.get(mv.to);
    if (movedPiece && !chess.isAttacked(
      chess.board().flat().find(
        (p) => p && p.type === "k" && p.color === oppColor
      )?.square as Square,
      myColor
    )) {
      // Actually, result.flags includes 'c' means check, not necessarily discovered
      // Discovered check: moved piece didn't directly give check
      const kingSquare = chess.board().flat().find(
        (p) => p && p.type === "k" && p.color === oppColor
      )?.square as Square | undefined;
      if (kingSquare && !chess.isAttacked(kingSquare, myColor)) {
        // The piece on mv.to doesn't attack the king — so it's discovered
        return {
          motif: "DISCOVERED_CHECK",
          confidence: 75,
          reason: `Discovered check: moving ${mv.from}-${mv.to} reveals check`,
        };
      }
    }
    return {
      motif: "DISCOVERED_CHECK",
      confidence: 65,
      reason: `Check via ${bestMoveUci}`,
    };
  }

  // ── 5. Pin (ray through lesser piece to greater piece) ────────────────────
  {
    const allMoves = chess.moves({ verbose: true });
    const oppKingSq = chess.board().flat().find(
      (p) => p && p.type === "k" && p.color === oppColor
    )?.square as Square | undefined;

    if (oppKingSq) {
      // If any opponent piece is attacked and can't move without exposing a valuable piece → PIN
      const movedPieceNow = chess.get(mv.to);
      if (movedPieceNow && (movedPieceNow.type === "r" || movedPieceNow.type === "b" || movedPieceNow.type === "q")) {
        // Check if we have a piece lined up with king
        const oppPiecesBetween = valuableSquares(new Chess(fenBefore), oppColor, 300);
        for (const pieceSq of oppPiecesBetween) {
          // Very rough: are mv.to, pieceSq, and oppKingSq collinear?
          const df1 = pieceSq.charCodeAt(0) - mv.to.charCodeAt(0);
          const dr1 = parseInt(pieceSq[1]) - parseInt(mv.to[1]);
          const df2 = oppKingSq.charCodeAt(0) - pieceSq.charCodeAt(0);
          const dr2 = parseInt(oppKingSq[1]) - parseInt(pieceSq[1]);
          const collinear = (df1 === 0 && df2 === 0) || (dr1 === 0 && dr2 === 0) ||
            (Math.abs(df1) === Math.abs(dr1) && Math.abs(df2) === Math.abs(dr2) && Math.sign(df1) === Math.sign(df2));
          if (collinear) {
            return {
              motif: "PIN",
              confidence: 70,
              reason: `Pin: ${bestMoveUci} pins ${chess.get(pieceSq)?.type.toUpperCase()} on ${pieceSq} to king`,
            };
          }
        }
      }
    }
  }

  // ── 6. Swing-based fallbacks ───────────────────────────────────────────────
  const absSwing = Math.abs(swingCp ?? 0);
  if (absSwing >= 400) {
    return {
      motif: "DEFENSIVE_MOVE",
      confidence: 40,
      reason: `Large tactical swing (${absSwing}cp) — defensive move missed`,
    };
  }

  return {
    motif: "QUIET_MOVE",
    confidence: 20,
    reason: `Positional mistake: ${bestMoveUci} was stronger`,
  };
}
