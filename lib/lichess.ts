// ---------------------------------------------------------------------------
// Lichess Study import utilities
// ---------------------------------------------------------------------------

// --- URL parsing -----------------------------------------------------------

export type LichessUrlParsed =
  | { type: "study"; studyId: string }
  | { type: "chapter"; studyId: string; chapterId: string };

/** Parse a Lichess study URL and return study/chapter IDs. */
export function parseLichessUrl(url: string): LichessUrlParsed | null {
  const m = url
    .trim()
    .match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  if (!m) return null;
  const [, studyId, chapterId] = m;
  if (chapterId) return { type: "chapter", studyId, chapterId };
  return { type: "study", studyId };
}

// --- Lichess API calls ------------------------------------------------------

export type LichessChapter = { id: string; name: string };

function lichessHeaders(extra: Record<string, string> = {}): HeadersInit {
  const token = process.env.LICHESS_API_TOKEN;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Fetch the list of chapters for a study (NDJSON). */
export async function fetchChapters(
  studyId: string
): Promise<LichessChapter[]> {
  const res = await fetch(
    `https://lichess.org/api/study/${studyId}/chapters`,
    { headers: lichessHeaders({ Accept: "application/x-ndjson" }) }
  );
  if (!res.ok)
    throw new Error(`Lichess API ${res.status}: ${res.statusText}`);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const obj = JSON.parse(line) as { id: string; name: string };
      return { id: obj.id, name: obj.name };
    });
}

/** Fetch a single chapter as PGN (with comments, without clocks/variations). */
export async function fetchChapterPgn(
  studyId: string,
  chapterId: string
): Promise<string> {
  const res = await fetch(
    `https://lichess.org/api/study/${studyId}/${chapterId}.pgn?comments=true&clocks=false&variations=false`,
    { headers: lichessHeaders({ Accept: "application/x-chess-pgn" }) }
  );
  if (!res.ok)
    throw new Error(`Lichess API ${res.status}: ${res.statusText}`);
  return res.text();
}

// --- PGN comment tokenizer --------------------------------------------------

export type MoveTok = { san: string; comment?: string };

/**
 * Tokenize PGN movetext into SAN+comment pairs.
 *
 * - Skips variations enclosed in parentheses (including nested).
 * - Attaches `{comment}` text to the preceding SAN token.
 * - Strips Lichess board-drawing commands like [%csl ...] and [%cal ...].
 * - Ignores $NAG tokens and move numbers.
 */
export function tokenizePgn(pgn: string): MoveTok[] {
  // Strip header tag lines (lines that start with "[")
  const movetext = pgn
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("["))
    .join(" ");

  const result: MoveTok[] = [];
  let i = 0;

  while (i < movetext.length) {
    const ch = movetext[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Variation — skip the entire parenthesised block (may be nested)
    if (ch === "(") {
      let depth = 1;
      i++;
      while (i < movetext.length && depth > 0) {
        if (movetext[i] === "(") depth++;
        else if (movetext[i] === ")") depth--;
        i++;
      }
      continue;
    }

    // Comment block { ... }
    if (ch === "{") {
      const end = movetext.indexOf("}", i);
      if (end === -1) {
        i++;
        continue;
      }
      const raw = movetext.slice(i + 1, end).trim();
      // Strip Lichess annotation commands  [%csl ...] [%cal ...]
      const clean = raw
        .replace(/\[%[a-z]+[^\]]*\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      // Attach to the most recent SAN token (if it has no comment yet)
      if (result.length > 0 && !result[result.length - 1].comment && clean) {
        result[result.length - 1].comment = clean;
      }
      i = end + 1;
      continue;
    }

    // NAG token  $<digits>
    if (ch === "$") {
      i++;
      while (i < movetext.length && /\d/.test(movetext[i])) i++;
      continue;
    }

    // Move number  <digits> followed by dots
    if (/\d/.test(ch)) {
      while (i < movetext.length && /[\d.]/.test(movetext[i])) i++;
      continue;
    }

    // Game termination marker
    const terminal = movetext.slice(i).match(/^(1-0|0-1|1\/2-1\/2|\*)/);
    if (terminal) {
      i += terminal[1].length;
      continue;
    }

    // SAN move  (castling first to avoid partial matches)
    const sanMatch = movetext.slice(i).match(
      /^(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQK])?[+#]?[!?]*)/
    );
    if (sanMatch?.[1]) {
      result.push({ san: sanMatch[1] });
      i += sanMatch[1].length;
      continue;
    }

    // Unknown character — skip
    i++;
  }

  return result;
}

// --- Bucket classifier ------------------------------------------------------

type Bucket = "STEP1" | "STEP2" | "STEP3" | "STEP4";
export type ClassifyResult = { bucket: Bucket; confidence: number };

/**
 * Keyword pattern groups in tie-break priority order: STEP4 > STEP2 > STEP1 > STEP3.
 * When multiple buckets match the same number of patterns, the one earlier in this
 * array wins.
 */
const BUCKET_PATTERNS: Array<{ bucket: Bucket; patterns: RegExp[] }> = [
  {
    bucket: "STEP4",
    patterns: [
      /automatic(ally)?/i,
      /blunder.?check/i,
      /didn.t (check|look|verify)/i,
      /without (checking|thinking|looking)/i,
      /one.move (blunder|think)/i,
      /played too fast/i,
      /forgot to check/i,
      /assumed (it was |it's )?fine/i,
      /reflexive(ly)?/i,
      /didn.t consider (the )?repl/i,
    ],
  },
  {
    bucket: "STEP2",
    patterns: [
      /missed (a |the )?(fork|pin|tactic|combo|combination|checkmate|mate|winning|sequence|discover)/i,
      /miscalculation/i,
      /calculation error/i,
      /(didn.t|failed to) (see|find|calculate) (the )?(tactic|combination|fork|pin|mate)/i,
      /missed (the )?tactical/i,
      /didn.t calculate/i,
      /missed (a |the )?skewer/i,
      /missed (a |the )?discovered/i,
    ],
  },
  {
    bucket: "STEP1",
    patterns: [
      /missed (the |their )?(threat|attack|danger|plan)/i,
      /didn.t see (the )?threat/i,
      /opponent (was|is) threatening/i,
      /failed to notice/i,
      /piece.{0,5}hanging/i,
      /left .{0,25} hanging/i,
      /missed the (attack|danger)/i,
      /didn.t notice (the )?opponent/i,
      /opponent (had|has) [a-z]/i,
    ],
  },
  {
    bucket: "STEP3",
    patterns: [
      /wrong plan/i,
      /positional (mistake|error|inaccuracy)/i,
      /pawn structure/i,
      /weak square/i,
      /waste.{0,5}tempo/i,
      /prophylaxis/i,
      /strategic (error|mistake)/i,
      /should have developed/i,
      /overextended/i,
      /no (clear |good )?plan/i,
      /wrong piece/i,
      /passive (move|play)?/i,
    ],
  },
];

/**
 * Classify a comment string into a STEP1–STEP4 bucket.
 *
 * Algorithm:
 * 1. Count pattern matches per bucket.
 * 2. Among the buckets with the highest match count, choose the one with
 *    highest priority (STEP4 > STEP2 > STEP1 > STEP3).
 * 3. Confidence: 90 if ≥2 patterns matched, 70 if 1 matched, 25 if none.
 */
export function classifyBucket(text: string): ClassifyResult {
  if (!text.trim()) return { bucket: "STEP3", confidence: 25 };

  const scores = BUCKET_PATTERNS.map(({ bucket, patterns }) => ({
    bucket,
    count: patterns.filter((p) => p.test(text)).length,
  }));

  const maxCount = Math.max(...scores.map((s) => s.count));
  if (maxCount === 0) return { bucket: "STEP3", confidence: 25 };

  // Priority is encoded by array order; find() returns the first (highest-priority) match
  const best = scores.find((s) => s.count === maxCount)!;
  const confidence = maxCount >= 2 ? 90 : 70;
  return { bucket: best.bucket, confidence };
}
