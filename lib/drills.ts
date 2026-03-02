import { MOTIF_META } from "./motifMeta";

export type ThemeHit = { themeKey: string; weight: number; reason: string };

export type DrillEntry = {
  motif: string;
  count: number;
  score: number;
  lichessUrl: string | null;
  label: string;
};

type Bucket = "STEP1" | "STEP2" | "STEP3" | "STEP4";

// Patterns that signal a blunder/dropped piece
const BLUNDER_PATTERNS: RegExp[] = [
  /\bblunder(ed|s)?\b/i,
  /\bhung\b/i,
  /\ben\s+prise\b/i,
  /\bdropped\b/i,
  /\bone[\s-]move\b/i,
  /\bmissed\s+reply\b/i,
];

// Keyword → (themeKey, weight) mappings — evaluated in order
const KEYWORD_THEMES: Array<{ pattern: RegExp; themeKey: string; weight: number }> = [
  { pattern: /\bfork(ed|s)?\b/i,                           themeKey: "FORK",              weight: 3 },
  { pattern: /\bpin(ned|s)?\b/i,                           themeKey: "PIN",               weight: 3 },
  { pattern: /\bskewer(ed|s)?\b/i,                         themeKey: "SKEWER",            weight: 3 },
  { pattern: /\bdiscover(ed)?\s+(check|attack)\b/i,        themeKey: "DISCOVERED_CHECK",  weight: 2 },
  { pattern: /\bdiscover(ed|y)?\b/i,                       themeKey: "DISCOVERED_ATTACK", weight: 2 },
  { pattern: /\btrap(ped|s)?\b/i,                          themeKey: "TRAPPED_PIECE",     weight: 3 },
  { pattern: /\b(zwischenzug|in-?between)\b/i,             themeKey: "INTERMEZZO",        weight: 3 },
  { pattern: /\bintermezzo\b/i,                            themeKey: "INTERMEZZO",        weight: 3 },
  { pattern: /\bdeflect(ion|ed|s)?\b/i,                    themeKey: "DEFLECTION",        weight: 3 },
  { pattern: /\battract(ion|ed|s)?\b/i,                    themeKey: "ATTRACTION",        weight: 3 },
  { pattern: /\bquiet\s+move\b|\bpositional\b/i,           themeKey: "QUIET_MOVE",        weight: 2 },
  { pattern: /\bdefend(ed|s|ing|ive)?\b|\bdefensive\b/i,  themeKey: "DEFENSIVE_MOVE",    weight: 2 },
  { pattern: /\bback[\s-]rank\b/i,                         themeKey: "BACK_RANK_MATE",    weight: 3 },
  { pattern: /\b(hang(ing|s)?|hung|en\s+prise)\b/i,        themeKey: "HANGING_PIECE",     weight: 2 },
  { pattern: /\b(checkmate|mate\s+in\s+1)\b/i,             themeKey: "MATE_IN_1",         weight: 3 },
  { pattern: /\bmate\s+in\s+2\b/i,                         themeKey: "MATE_IN_2",         weight: 3 },
  { pattern: /\bmissed\b/i,                                themeKey: "DEFENSIVE_MOVE",    weight: 1 },
];

// Fallback themes per bucket when no keywords match
const BUCKET_FALLBACKS: Record<Bucket, ThemeHit[]> = {
  STEP1: [{ themeKey: "DEFENSIVE_MOVE", weight: 1, reason: "bucket:STEP1" }],
  STEP2: [{ themeKey: "FORK",           weight: 1, reason: "bucket:STEP2" }],
  STEP3: [{ themeKey: "QUIET_MOVE",     weight: 1, reason: "bucket:STEP3" }],
  STEP4: [
    { themeKey: "DEFENSIVE_MOVE", weight: 1, reason: "bucket:STEP4" },
    { themeKey: "MATE_IN_2",      weight: 1, reason: "bucket:STEP4" },
  ],
};

/**
 * Extract weighted theme hints from a free-text annotation note.
 * Falls back to bucket-based defaults when no keywords are found.
 */
export function noteToThemes(note: string, bucket?: string): ThemeHit[] {
  const hits: ThemeHit[] = [];

  // Blunder-group patterns → defensiveMove (weight 3) + mateIn1 (weight 2)
  if (BLUNDER_PATTERNS.some((p) => p.test(note))) {
    hits.push({ themeKey: "DEFENSIVE_MOVE", weight: 3, reason: "blunder pattern" });
    hits.push({ themeKey: "MATE_IN_1",      weight: 2, reason: "blunder → missed mate check" });
  }

  // Explicit motif keywords
  for (const { pattern, themeKey, weight } of KEYWORD_THEMES) {
    if (pattern.test(note)) {
      hits.push({ themeKey, weight, reason: `keyword:${themeKey}` });
    }
  }

  // Bucket fallback when nothing matched
  if (hits.length === 0 && bucket && bucket in BUCKET_FALLBACKS) {
    return BUCKET_FALLBACKS[bucket as Bucket];
  }

  return hits;
}

/**
 * Compute the two weekly drills:
 *   drill1 — top theme from manual annotations (notes)
 *   drill2 — top Stockfish motif, excluding drill1's theme
 */
export function computeDrills(
  annotations: Array<{ note: string; bucket?: string | null }>,
  findings: Array<{ motif: string; swingCp?: number | null }>
): [DrillEntry | null, DrillEntry | null] {
  // ── Drill 1: aggregate noteToThemes across all annotations ─────────────────
  const themeAgg: Record<string, { totalWeight: number; count: number }> = {};

  for (const ann of annotations) {
    const themes = noteToThemes(ann.note, ann.bucket ?? undefined);
    // Track which themes were seen for this annotation to avoid double-counting
    const seenForThisAnn = new Set<string>();
    for (const { themeKey, weight } of themes) {
      if (!themeAgg[themeKey]) themeAgg[themeKey] = { totalWeight: 0, count: 0 };
      themeAgg[themeKey].totalWeight += weight;
      if (!seenForThisAnn.has(themeKey)) {
        themeAgg[themeKey].count++;
        seenForThisAnn.add(themeKey);
      }
    }
  }

  const top1 = Object.entries(themeAgg).sort(
    (a, b) => b[1].totalWeight - a[1].totalWeight
  )[0];

  const drill1: DrillEntry | null = top1
    ? {
        motif: top1[0],
        count: top1[1].count,
        score: top1[1].totalWeight,
        label: MOTIF_META[top1[0]]?.label ?? top1[0],
        lichessUrl: MOTIF_META[top1[0]]?.lichessUrl ?? null,
      }
    : null;

  // ── Drill 2: rank findings by sum(|swingCp|), pick top ≠ drill1 ───────────
  const motifAgg: Record<string, { count: number; totalSwing: number }> = {};

  for (const f of findings) {
    if (!motifAgg[f.motif]) motifAgg[f.motif] = { count: 0, totalSwing: 0 };
    motifAgg[f.motif].count++;
    motifAgg[f.motif].totalSwing += Math.abs(f.swingCp ?? 150);
  }

  const drill2 =
    Object.entries(motifAgg)
      .map(([motif, { count, totalSwing }]) => ({
        motif,
        count,
        score: count * 1 + totalSwing / 300,
        label: MOTIF_META[motif]?.label ?? motif,
        lichessUrl: MOTIF_META[motif]?.lichessUrl ?? null,
      }))
      .sort((a, b) => b.score - a.score)
      .find((d) => d.motif !== drill1?.motif) ?? null;

  return [drill1, drill2];
}
