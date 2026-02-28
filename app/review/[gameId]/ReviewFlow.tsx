"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  toggleMoveSelected,
  finishReview,
  createAnnotation,
  updateAnnotation,
} from "@/lib/actions";

// ── Board (SSR-unsafe, must be dynamically imported) ─────────────────────────
const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: 400, height: 400 }}
        className="bg-gray-100 rounded animate-pulse"
      />
    ),
  }
);

// ── Types ────────────────────────────────────────────────────────────────────

type AnnotationData = {
  id: string;
  bucket: string;
  note: string;
  tags: string | null;
  severity: number | null;
};

type MoveData = {
  id: number;
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  selectedForReview: boolean;
  annotations: AnnotationData[];
};

type GameData = {
  id: number;
  white: string;
  black: string;
  result: string;
  moves: MoveData[];
};

// ── Constants ────────────────────────────────────────────────────────────────

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TOTAL_SECONDS = 15 * 60;
const MAX_SELECTED = 3;

const BUCKETS = [
  { value: "STEP1", label: "Step 1 — Opponent threat/intent missed" },
  { value: "STEP2", label: "Step 2 — Missed forcing move / miscalc" },
  { value: "STEP3", label: "Step 3 — Wrong plan / positional inaccuracy" },
  { value: "STEP4", label: "Step 4 — No blunder-check (missed opponent reply)" },
] as const;

type AnnotationForm = {
  bucket: string;
  note: string;
  tags: string;
  severity: string;
};

const BLANK_FORM: AnnotationForm = {
  bucket: "STEP1",
  note: "",
  tags: "",
  severity: "",
};

function formFromAnnotation(ann: AnnotationData): AnnotationForm {
  return {
    bucket: ann.bucket,
    note: ann.note,
    tags: ann.tags ?? "",
    severity: ann.severity?.toString() ?? "",
  };
}

// ── Player label ─────────────────────────────────────────────────────────────

function PlayerLabel({ name, color }: { name: string; color: "white" | "black" }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${
          color === "white" ? "bg-white border-gray-300" : "bg-gray-900 border-gray-600"
        }`}
      />
      <span className="font-semibold text-sm truncate">{name}</span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ReviewFlow({ game }: { game: GameData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  useEffect(() => {
    const id = setInterval(
      () => setTimeLeft((t) => Math.max(0, t - 1)),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const timerMin = Math.floor(timeLeft / 60);
  const timerSec = timeLeft % 60;
  const timerStr = `${timerMin}:${timerSec.toString().padStart(2, "0")}`;
  const timerColor =
    timeLeft < 120
      ? "text-red-400"
      : timeLeft < 300
      ? "text-orange-400"
      : "text-gray-400";

  // ── Step ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () =>
      new Set(
        game.moves.filter((m) => m.selectedForReview).map((m) => m.id)
      )
  );
  const [boardPly, setBoardPly] = useState<number | null>(null);
  const [selectWarning, setSelectWarning] = useState("");
  const [flipped, setFlipped] = useState(false);

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [annotIdx, setAnnotIdx] = useState(0);
  const [step2Ply, setStep2Ply] = useState<number | null>(null);
  const [annotForms, setAnnotForms] = useState<Record<number, AnnotationForm>>(
    {}
  );
  const [annotSaved, setAnnotSaved] = useState<Set<number>>(new Set());
  const [annotError, setAnnotError] = useState("");

  // ── Step 3 state ──────────────────────────────────────────────────────────
  const [nextHabit, setNextHabit] = useState("");
  const [weeklyDrill, setWeeklyDrill] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [wrapError, setWrapError] = useState("");

  // Sync step-2 board to the active annotation move when the tab changes
  useEffect(() => {
    const ply = game.moves.filter((m) => selectedIds.has(m.id))[annotIdx]?.ply ?? null;
    setStep2Ply(ply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotIdx]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedMoves = game.moves.filter((m) => selectedIds.has(m.id));
  const currentAnnotMove = selectedMoves[annotIdx] ?? null;

  // Board navigation indices
  const boardPlyIdx =
    boardPly !== null ? game.moves.findIndex((m) => m.ply === boardPly) : -1;
  const step2PlyIdx =
    step2Ply !== null ? game.moves.findIndex((m) => m.ply === step2Ply) : -1;

  const boardFen =
    step === 1
      ? (boardPly !== null
          ? game.moves.find((m) => m.ply === boardPly)?.fenAfter
          : undefined) ?? START_FEN
      : (step2Ply !== null
          ? game.moves.find((m) => m.ply === step2Ply)?.fenAfter
          : currentAnnotMove?.fenAfter) ?? START_FEN;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleMove(moveId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(moveId)) {
        next.delete(moveId);
        setSelectWarning("");
      } else {
        if (next.size >= MAX_SELECTED) {
          setSelectWarning(`Max ${MAX_SELECTED} moves. Deselect one first.`);
          return prev;
        }
        next.add(moveId);
        setSelectWarning("");
      }
      return next;
    });
  }

  function goToStep2() {
    if (selectedIds.size === 0) {
      setSelectWarning("Select at least 1 move to annotate.");
      return;
    }
    // Pre-fill annotation forms from existing annotations
    const forms: Record<number, AnnotationForm> = {};
    for (const move of game.moves) {
      if (!selectedIds.has(move.id)) continue;
      forms[move.id] = move.annotations[0]
        ? formFromAnnotation(move.annotations[0])
        : { ...BLANK_FORM };
    }
    setAnnotForms(forms);
    setAnnotIdx(0);
    setAnnotError("");
    setStep(2);

    // Persist selections to DB in the background
    startTransition(async () => {
      for (const move of game.moves) {
        const want = selectedIds.has(move.id);
        if (move.selectedForReview !== want) {
          await toggleMoveSelected(move.id, want);
        }
      }
    });
  }

  function patchForm(moveId: number, patch: Partial<AnnotationForm>) {
    setAnnotForms((f) => ({
      ...f,
      [moveId]: { ...(f[moveId] ?? BLANK_FORM), ...patch },
    }));
  }

  function saveAnnotation() {
    if (!currentAnnotMove) return;
    const form = annotForms[currentAnnotMove.id] ?? BLANK_FORM;
    if (!form.note.trim()) {
      setAnnotError("Note is required.");
      return;
    }
    const severity = form.severity ? parseInt(form.severity, 10) : undefined;
    if (severity !== undefined && (isNaN(severity) || severity < 1 || severity > 5)) {
      setAnnotError("Severity must be 1–5.");
      return;
    }
    setAnnotError("");

    startTransition(async () => {
      try {
        const existing = currentAnnotMove.annotations[0];
        if (existing) {
          await updateAnnotation(
            game.id,
            existing.id,
            form.bucket,
            form.note,
            form.tags || undefined,
            severity
          );
        } else {
          await createAnnotation(
            game.id,
            currentAnnotMove.id,
            form.bucket,
            form.note,
            form.tags || undefined,
            severity
          );
        }
        setAnnotSaved((s) => new Set(s).add(currentAnnotMove.id));
        // Auto-advance to next unannotated move
        const nextUnannotated = selectedMoves.findIndex(
          (m, i) => i > annotIdx && !annotSaved.has(m.id)
        );
        if (nextUnannotated !== -1) setAnnotIdx(nextUnannotated);
      } catch (e) {
        setAnnotError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function handleFinish() {
    if (nextHabit.trim().length < 5) {
      setWrapError("Next-game habit must be at least 5 characters.");
      return;
    }
    if (weeklyDrill.trim().length < 5) {
      setWrapError("Weekly drill must be at least 5 characters.");
      return;
    }
    setWrapError("");

    startTransition(async () => {
      try {
        await finishReview(
          game.id,
          nextHabit,
          weeklyDrill,
          reviewNotes || undefined
        );
        router.push("/");
      } catch (e) {
        setWrapError(e instanceof Error ? e.message : "Failed to finish review.");
      }
    });
  }

  // ── Board navigation ──────────────────────────────────────────────────────

  function step1Back() {
    if (boardPlyIdx > 0) setBoardPly(game.moves[boardPlyIdx - 1].ply);
    else setBoardPly(null);
  }
  function step1Forward() {
    if (boardPlyIdx === -1) setBoardPly(game.moves[0]?.ply ?? null);
    else if (boardPlyIdx < game.moves.length - 1)
      setBoardPly(game.moves[boardPlyIdx + 1].ply);
  }
  function step2Back() {
    if (step2PlyIdx > 0) setStep2Ply(game.moves[step2PlyIdx - 1].ply);
  }
  function step2Forward() {
    if (step2PlyIdx >= 0 && step2PlyIdx < game.moves.length - 1)
      setStep2Ply(game.moves[step2PlyIdx + 1].ply);
  }

  // ── Move pair grouping (step 1 list) ──────────────────────────────────────
  type MovePair = {
    moveNum: number;
    white: MoveData | null;
    black: MoveData | null;
  };
  const movePairs = game.moves.reduce<MovePair[]>((acc, move) => {
    const moveNum = Math.ceil(move.ply / 2);
    if (move.ply % 2 === 1) {
      acc.push({ moveNum, white: move, black: null });
    } else {
      const last = acc[acc.length - 1];
      if (last && last.black === null) {
        last.black = move;
      } else {
        acc.push({ moveNum, white: null, black: move });
      }
    }
    return acc;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Home
            </Link>
            <h1 className="text-lg font-bold">15-Minute Review</h1>
          </div>
          <p className="text-sm text-gray-500">
            {game.white} vs {game.black} · {game.result}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step
                    ? "w-6 bg-blue-600"
                    : s < step
                    ? "w-2 bg-blue-400"
                    : "w-2 bg-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">Step {step} of 3</span>
          {/* Timer */}
          <span className={`font-mono text-xl font-bold tabular-nums ${timerColor}`}>
            {timerStr}
          </span>
        </div>
      </div>

      {/* ── Step 1: Select moves ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex gap-6 items-start">
          <div className="shrink-0">
            <PlayerLabel
              name={flipped ? game.white : game.black}
              color={flipped ? "white" : "black"}
            />
            <Chessboard
              options={{
                position: boardFen,
                boardStyle: { width: "400px", maxWidth: "400px" },
                allowDragging: false,
                boardOrientation: flipped ? "black" : "white",
              }}
            />
            <PlayerLabel
              name={flipped ? game.black : game.white}
              color={flipped ? "black" : "white"}
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={step1Back}
                disabled={boardPlyIdx === -1}
                className="flex-1 border rounded py-1 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setFlipped((f) => !f)}
                title="Flip board"
                className="border rounded px-2 py-1 text-sm hover:bg-gray-50 transition-colors"
              >
                ⇅
              </button>
              <button
                onClick={step1Forward}
                disabled={boardPlyIdx === game.moves.length - 1}
                className="flex-1 border rounded py-1 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Select key moments</h2>
              <span className="text-sm text-gray-500">
                {selectedIds.size} / {MAX_SELECTED} selected
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Pick up to 3 moves where you went wrong or want to understand
              better. Click a move to see it on the board.
            </p>

            {selectWarning && (
              <p className="text-sm text-amber-600 mb-2">{selectWarning}</p>
            )}

            <div className="border rounded max-h-80 overflow-y-auto font-mono text-sm mb-4">
              {movePairs.map((pair) => (
                <div
                  key={pair.moveNum}
                  className="flex items-center border-b last:border-b-0 px-2 py-0.5"
                >
                  <span className="w-7 text-gray-400 shrink-0 text-xs">
                    {pair.moveNum}.
                  </span>
                  {([pair.white, pair.black] as (MoveData | null)[]).map(
                    (move, i) =>
                      move ? (
                        <div
                          key={move.id}
                          className="flex items-center gap-1 mr-3"
                        >
                          <button
                            onClick={() => setBoardPly(move.ply)}
                            className={`px-1.5 py-0.5 rounded text-xs ${
                              boardPly === move.ply
                                ? "bg-gray-200"
                                : "hover:bg-gray-100"
                            }`}
                          >
                            {move.san}
                          </button>
                          <button
                            onClick={() => toggleMove(move.id)}
                            className={`w-6 h-5 text-[10px] rounded border transition-colors ${
                              selectedIds.has(move.id)
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-300 text-gray-400 hover:border-blue-400"
                            }`}
                          >
                            {selectedIds.has(move.id) ? "✓" : "+"}
                          </button>
                        </div>
                      ) : (
                        <span key={i} className="w-20 inline-block" />
                      )
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={goToStep2}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Continue to annotations →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Annotate ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex gap-6 items-start">
          <div className="shrink-0">
            <PlayerLabel
              name={flipped ? game.white : game.black}
              color={flipped ? "white" : "black"}
            />
            <Chessboard
              options={{
                position: boardFen,
                boardStyle: { width: "400px", maxWidth: "400px" },
                allowDragging: false,
                boardOrientation: flipped ? "black" : "white",
              }}
            />
            <PlayerLabel
              name={flipped ? game.black : game.white}
              color={flipped ? "black" : "white"}
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={step2Back}
                disabled={step2PlyIdx <= 0}
                className="flex-1 border rounded py-1 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setFlipped((f) => !f)}
                title="Flip board"
                className="border rounded px-2 py-1 text-sm hover:bg-gray-50 transition-colors"
              >
                ⇅
              </button>
              <button
                onClick={step2Forward}
                disabled={step2PlyIdx >= game.moves.length - 1}
                className="flex-1 border rounded py-1 text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-2 w-full text-sm text-gray-500 hover:underline"
            >
              ← Change selection
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Annotate moves</h2>
              <span className="text-sm text-gray-500">
                {annotSaved.size} / {selectedMoves.length} saved
              </span>
            </div>

            {/* Move tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selectedMoves.map((m, i) => {
                const num = Math.ceil(m.ply / 2);
                const side = m.ply % 2 === 1 ? "." : "...";
                const saved = annotSaved.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setAnnotIdx(i);
                      setAnnotError("");
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                      i === annotIdx
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    } ${saved ? "ring-1 ring-green-500" : ""}`}
                  >
                    {num}{side}{m.san}
                    {saved && <span className="ml-1 text-green-400">✓</span>}
                  </button>
                );
              })}
            </div>

            {currentAnnotMove && (
              <div className="space-y-3">
                {/* Bucket */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Bucket <span className="text-red-400">*</span>
                  </label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    value={annotForms[currentAnnotMove.id]?.bucket ?? "STEP1"}
                    onChange={(e) =>
                      patchForm(currentAnnotMove.id, { bucket: e.target.value })
                    }
                  >
                    {BUCKETS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">
                      Tags
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      placeholder="fork, pin, time pressure…"
                      value={annotForms[currentAnnotMove.id]?.tags ?? ""}
                      onChange={(e) =>
                        patchForm(currentAnnotMove.id, { tags: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs text-gray-500 mb-1">
                      Severity
                    </label>
                    <select
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      value={annotForms[currentAnnotMove.id]?.severity ?? ""}
                      onChange={(e) =>
                        patchForm(currentAnnotMove.id, {
                          severity: e.target.value,
                        })
                      }
                    >
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Note <span className="text-red-400">*</span> — 1–2 sentences
                  </label>
                  <textarea
                    className="w-full border rounded px-2 py-1.5 text-sm h-24 resize-y"
                    placeholder="What went wrong? What should you have done instead?"
                    value={annotForms[currentAnnotMove.id]?.note ?? ""}
                    onChange={(e) =>
                      patchForm(currentAnnotMove.id, { note: e.target.value })
                    }
                  />
                </div>

                {annotError && (
                  <p className="text-xs text-red-600">{annotError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={saveAnnotation}
                    disabled={isPending}
                    className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Saving…" : "Save annotation"}
                  </button>
                  <button
                    onClick={() => {
                      if (annotSaved.size === 0) {
                        setAnnotError(
                          "Save at least one annotation before continuing."
                        );
                        return;
                      }
                      setStep(3);
                    }}
                    className="flex-1 border py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Wrap-up →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Wrap-up ──────────────────────────────────────────── */}
      {step === 3 && (
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-bold mb-1">Commit &amp; finish</h2>
          <p className="text-gray-500 text-sm mb-6">
            3 minutes · Lock in what you will do differently.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-1">
                Next-game habit{" "}
                <span className="text-red-400 font-normal">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-1.5">
                One thing you will do on every move of your next game.
              </p>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Before moving: name what my opponent threatens."
                value={nextHabit}
                onChange={(e) => setNextHabit(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                This-week drill{" "}
                <span className="text-red-400 font-normal">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-1.5">
                A specific training task to do this week.
              </p>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="30 min of CCT puzzles on chess.com."
                value={weeklyDrill}
                onChange={(e) => setWeeklyDrill(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Review notes{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm h-20 resize-y"
                placeholder="2–3 sentences on what you learned from this game."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>

            {wrapError && (
              <p className="text-sm text-red-600">{wrapError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="border px-4 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleFinish}
                disabled={isPending}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Saving…" : "✓ Finish review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
