"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// react-chessboard uses window/document at render time — must skip SSR.
const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: 440, height: 440 }}
        className="bg-gray-100 rounded animate-pulse"
      />
    ),
  }
);

import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from "@/lib/actions";

// ---------------------------------------------------------------------------
// Types (mirroring Prisma shape, safe for client boundary)
// ---------------------------------------------------------------------------

type AnnotationData = {
  id: string;
  bucket: string;
  note: string;
  tags: string | null;
  severity: number | null;
  source: string | null;
  confidence: number | null;
  createdAt: Date;
};

type MoveData = {
  id: number;
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  annotations: AnnotationData[];
};

type GameData = {
  id: number;
  white: string;
  black: string;
  result: string;
  moves: MoveData[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const BUCKETS = [
  { value: "STEP1", label: "Step 1 — Opponent threat/intent missed" },
  { value: "STEP2", label: "Step 2 — Missed forcing move / miscalc" },
  { value: "STEP3", label: "Step 3 — Wrong plan / positional inaccuracy" },
  { value: "STEP4", label: "Step 4 — No blunder-check (missed opponent reply)" },
] as const;

const BLANK_FORM = {
  bucket: "STEP1",
  note: "",
  tags: "",
  severity: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GameViewer({ game }: { game: GameData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [filterSource, setFilterSource] = useState<"all" | "manual" | "lichess">("all");

  // Derived state
  const selectedMove =
    selectedPly !== null
      ? (game.moves.find((m) => m.ply === selectedPly) ?? null)
      : null;

  const boardFen =
    selectedMove?.fenAfter ?? game.moves[0]?.fenBefore ?? START_FEN;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  // Index of the currently selected move in game.moves (-1 = start position)
  const currentIndex =
    selectedPly !== null
      ? game.moves.findIndex((m) => m.ply === selectedPly)
      : -1;

  function selectMove(ply: number) {
    setSelectedPly(ply);
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError("");
  }

  function stepBack() {
    if (currentIndex === -1) return; // already at start
    if (currentIndex === 0) {
      setSelectedPly(null); // back to start position
    } else {
      selectMove(game.moves[currentIndex - 1].ply);
    }
  }

  function stepForward() {
    if (game.moves.length === 0) return;
    if (currentIndex === -1) {
      selectMove(game.moves[0].ply);
    } else if (currentIndex < game.moves.length - 1) {
      selectMove(game.moves[currentIndex + 1].ply);
    }
  }

  function loadAnnotation(ann: AnnotationData) {
    setEditingId(ann.id);
    setForm({
      bucket: ann.bucket,
      note: ann.note,
      tags: ann.tags ?? "",
      severity: ann.severity?.toString() ?? "",
    });
    setFormError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError("");
  }

  function handleSave() {
    if (!selectedMove) return;
    if (!form.note.trim()) {
      setFormError("Note is required.");
      return;
    }
    const severity = form.severity ? parseInt(form.severity, 10) : undefined;
    if (
      severity !== undefined &&
      (isNaN(severity) || severity < 1 || severity > 5)
    ) {
      setFormError("Severity must be 1–5.");
      return;
    }
    setFormError("");

    startTransition(async () => {
      try {
        if (editingId) {
          await updateAnnotation(
            game.id,
            editingId,
            form.bucket,
            form.note,
            form.tags || undefined,
            severity
          );
        } else {
          await createAnnotation(
            game.id,
            selectedMove.id,
            form.bucket,
            form.note,
            form.tags || undefined,
            severity
          );
        }
        resetForm();
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function handleDelete(annotationId: string) {
    startTransition(async () => {
      try {
        await deleteAnnotation(game.id, annotationId);
        if (editingId === annotationId) resetForm();
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Group moves into full-move pairs for display
  // ---------------------------------------------------------------------------

  type MovePair = {
    moveNum: number;
    white: MoveData | null;
    black: MoveData | null;
  };

  const movePairs = game.moves.reduce<MovePair[]>((acc, move) => {
    const moveNum = Math.ceil(move.ply / 2);
    if (move.ply % 2 === 1) {
      // White move
      acc.push({ moveNum, white: move, black: null });
    } else {
      // Black move — attach to the last pair if its black slot is empty
      const last = acc[acc.length - 1];
      if (last && last.black === null) {
        last.black = move;
      } else {
        acc.push({ moveNum, white: null, black: move });
      }
    }
    return acc;
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex gap-6 items-start">
      {/* ── Board + nav buttons ────────────────────────────────────────── */}
      <div className="shrink-0">
        {/* Top player (opponent when white-at-bottom, self when flipped) */}
        <PlayerLabel
          name={flipped ? game.white : game.black}
          color={flipped ? "white" : "black"}
        />

        <Chessboard
          options={{
            position: boardFen,
            boardStyle: { width: "440px", maxWidth: "440px" },
            allowDragging: false,
            boardOrientation: flipped ? "black" : "white",
          }}
        />

        {/* Bottom player */}
        <PlayerLabel
          name={flipped ? game.black : game.white}
          color={flipped ? "black" : "white"}
        />

        <div className="flex gap-2 mt-2">
          <button
            onClick={stepBack}
            disabled={currentIndex === -1}
            className="flex-1 py-1.5 border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="px-3 py-1.5 border rounded text-sm font-medium hover:bg-gray-50 transition-colors"
            title="Flip board"
          >
            ⇅
          </button>
          <button
            onClick={stepForward}
            disabled={currentIndex === game.moves.length - 1}
            className="flex-1 py-1.5 border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Annotation source filter */}
        <div className="flex gap-1 text-xs">
          {(["all", "manual", "lichess"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterSource(f)}
              className={`px-2.5 py-1 rounded border transition-colors ${
                filterSource === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "All" : f === "manual" ? "Manual" : "Lichess"}
            </button>
          ))}
        </div>

        {/* Move list */}
        <div className="border rounded p-3 max-h-72 overflow-y-auto font-mono text-sm">
          {movePairs.length === 0 ? (
            <p className="text-gray-400 text-xs">No moves recorded.</p>
          ) : (
            movePairs.map((pair) => (
              <div key={pair.moveNum} className="flex items-center mb-0.5">
                <span className="w-8 text-gray-400 shrink-0 select-none">
                  {pair.moveNum}.
                </span>
                <MovePill
                  move={pair.white}
                  selectedPly={selectedPly}
                  onClick={selectMove}
                />
                <MovePill
                  move={pair.black}
                  selectedPly={selectedPly}
                  onClick={selectMove}
                />
              </div>
            ))
          )}
        </div>

        {/* Annotation panel */}
        <div className="border rounded p-4">
          {selectedMove === null ? (
            <p className="text-sm text-gray-400">
              Select a move to view and add annotations.
            </p>
          ) : (
            <AnnotationPanel
              move={selectedMove}
              editingId={editingId}
              form={form}
              formError={formError}
              isPending={isPending}
              filterSource={filterSource}
              onLoadAnnotation={loadAnnotation}
              onDelete={handleDelete}
              onFormChange={(patch) =>
                setForm((f) => ({ ...f, ...patch }))
              }
              onSave={handleSave}
              onResetForm={resetForm}
            />
          )}
        </div>


      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlayerLabel({
  name,
  color,
}: {
  name: string;
  color: "white" | "black";
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${
          color === "white"
            ? "bg-white border-gray-300"
            : "bg-gray-900 border-gray-600"
        }`}
      />
      <span className="font-semibold text-sm truncate">{name}</span>
    </div>
  );
}

function MovePill({
  move,
  selectedPly,
  onClick,
}: {
  move: MoveData | null;
  selectedPly: number | null;
  onClick: (ply: number) => void;
}) {
  if (!move) return <span className="w-20 inline-block" />;
  const isSelected = move.ply === selectedPly;
  const hasAnnotation = move.annotations.length > 0;

  return (
    <button
      onClick={() => onClick(move.ply)}
      className={`w-20 text-left px-1.5 py-0.5 rounded transition-colors ${
        isSelected
          ? "bg-blue-600 text-white"
          : "hover:bg-gray-100 text-gray-800"
      }`}
    >
      {move.san}
      {hasAnnotation && (
        <span
          className={`ml-1 text-[10px] ${
            isSelected ? "text-blue-200" : "text-blue-500"
          }`}
        >
          ●
        </span>
      )}
    </button>
  );
}

type FormState = typeof BLANK_FORM;

function AnnotationPanel({
  move,
  editingId,
  form,
  formError,
  isPending,
  filterSource,
  onLoadAnnotation,
  onDelete,
  onFormChange,
  onSave,
  onResetForm,
}: {
  move: MoveData;
  editingId: string | null;
  form: FormState;
  formError: string;
  isPending: boolean;
  filterSource: "all" | "manual" | "lichess";
  onLoadAnnotation: (ann: AnnotationData) => void;
  onDelete: (id: string) => void;
  onFormChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onResetForm: () => void;
}) {
  const moveLabel = `${Math.ceil(move.ply / 2)}${
    move.ply % 2 === 1 ? "." : "..."
  } ${move.san}`;

  return (
    <>
      <h2 className="font-semibold text-sm mb-3">
        Annotations for{" "}
        <span className="font-mono">{moveLabel}</span>
      </h2>

      {/* Existing annotations list */}
      {(() => {
        const visible = move.annotations.filter((ann) => {
          if (filterSource === "all") return true;
          if (filterSource === "lichess") return ann.source === "lichess";
          return ann.source !== "lichess"; // "manual"
        });
        if (visible.length === 0) {
          return (
            <p className="text-xs text-gray-400 mb-3">
              {move.annotations.length === 0
                ? "No annotations yet for this move."
                : "No annotations match the current filter."}
            </p>
          );
        }
        return (
          <div className="mb-4 space-y-2">
            {visible.map((ann) => {
              const bucketLabel =
                BUCKETS.find((b) => b.value === ann.bucket)?.label ?? ann.bucket;
              const isEditing = editingId === ann.id;
              const isLichess = ann.source === "lichess";
              return (
                <div
                  key={ann.id}
                  className={`border rounded p-2.5 text-sm cursor-pointer transition-colors ${
                    isEditing
                      ? "border-blue-400 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => onLoadAnnotation(ann)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-blue-700">
                          {bucketLabel}
                        </span>
                        {isLichess && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                            Lichess import
                            {ann.confidence != null && ` · ${ann.confidence}%`}
                          </span>
                        )}
                        {ann.severity != null && (
                          <span className="text-[10px] text-gray-400">
                            severity {ann.severity}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-gray-700 line-clamp-2 text-xs">
                        {ann.note}
                      </p>
                      {ann.tags && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {ann.tags}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(ann.id);
                      }}
                      disabled={isPending}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Form */}
      <div className="border-t pt-3 space-y-2.5">
        <p className="text-xs font-medium text-gray-600">
          {editingId ? "Editing annotation" : "New annotation"}
          {editingId && (
            <button
              onClick={onResetForm}
              className="ml-2 text-blue-600 hover:underline font-normal"
            >
              Cancel
            </button>
          )}
        </p>

        {/* Bucket */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Bucket <span className="text-red-400">*</span>
          </label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={form.bucket}
            onChange={(e) => onFormChange({ bucket: e.target.value })}
          >
            {BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags + Severity */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">
              Tags (optional, comma-separated)
            </label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="fork, pin, time pressure"
              value={form.tags}
              onChange={(e) => onFormChange({ tags: e.target.value })}
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 mb-1">
              Severity (1–5)
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={form.severity}
              onChange={(e) => onFormChange({ severity: e.target.value })}
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
            Note <span className="text-red-400">*</span>
          </label>
          <textarea
            className="w-full border rounded px-2 py-1 text-sm h-24 resize-y"
            placeholder="Describe the mistake and what you should have done instead."
            value={form.note}
            onChange={(e) => onFormChange({ note: e.target.value })}
          />
        </div>

        {formError && (
          <p className="text-xs text-red-600">{formError}</p>
        )}

        <button
          onClick={onSave}
          disabled={isPending}
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending
            ? "Saving…"
            : editingId
            ? "Update annotation"
            : "Save annotation"}
        </button>
      </div>
    </>
  );
}
