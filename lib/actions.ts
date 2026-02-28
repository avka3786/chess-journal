"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const VALID_BUCKETS = ["STEP1", "STEP2", "STEP3", "STEP4"] as const;
type Bucket = (typeof VALID_BUCKETS)[number];

function validateBucket(b: string): b is Bucket {
  return (VALID_BUCKETS as readonly string[]).includes(b);
}

function validateInputs(bucket: string, note: string, severity?: number) {
  if (!validateBucket(bucket)) throw new Error("Invalid bucket value.");
  if (!note.trim()) throw new Error("Note is required.");
  if (
    severity !== undefined &&
    (!Number.isInteger(severity) || severity < 1 || severity > 5)
  ) {
    throw new Error("Severity must be an integer between 1 and 5.");
  }
}

// ---------------------------------------------------------------------------
// Annotation actions
// ---------------------------------------------------------------------------

export async function createAnnotation(
  gameId: number,
  moveId: number,
  bucket: string,
  note: string,
  tags?: string,
  severity?: number
) {
  validateInputs(bucket, note, severity);
  await db.annotation.create({
    data: {
      moveId,
      bucket,
      note: note.trim(),
      tags: tags?.trim() || null,
      severity: severity ?? null,
    },
  });
  revalidatePath(`/games/${gameId}`);
}

export async function updateAnnotation(
  gameId: number,
  annotationId: string,
  bucket: string,
  note: string,
  tags?: string,
  severity?: number
) {
  validateInputs(bucket, note, severity);
  await db.annotation.update({
    where: { id: annotationId },
    data: {
      bucket,
      note: note.trim(),
      tags: tags?.trim() || null,
      severity: severity ?? null,
    },
  });
  revalidatePath(`/games/${gameId}`);
}

export async function deleteAnnotation(gameId: number, annotationId: string) {
  await db.annotation.delete({ where: { id: annotationId } });
  revalidatePath(`/games/${gameId}`);
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

export async function deleteGame(gameId: number) {
  await db.game.delete({ where: { id: gameId } });
  revalidatePath("/games");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------------

/** Returns the ID of the most recent unreviewed game, or null. */
export async function startNextReview(): Promise<number | null> {
  const game = await db.game.findFirst({
    where: { reviewedAt: null },
    orderBy: { importedAt: "desc" },
    select: { id: true },
  });
  return game?.id ?? null;
}

/** Persist whether a move is selected for the current review session. */
export async function toggleMoveSelected(moveId: number, selected: boolean) {
  await db.move.update({
    where: { id: moveId },
    data: { selectedForReview: selected },
  });
}

/** Complete a review: save habit/drill/notes and mark the game as reviewed. */
export async function finishReview(
  gameId: number,
  nextHabit: string,
  weeklyDrill: string,
  reviewNotes?: string
) {
  const habit = nextHabit.trim();
  const drill = weeklyDrill.trim();
  if (habit.length < 5)
    throw new Error("Next-game habit must be at least 5 characters.");
  if (drill.length < 5)
    throw new Error("Weekly drill must be at least 5 characters.");

  await db.game.update({
    where: { id: gameId },
    data: {
      reviewedAt: new Date(),
      reviewDurationMin: 15,
      nextHabit: habit,
      weeklyDrill: drill,
      reviewNotes: reviewNotes?.trim() || null,
    },
  });
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath(`/review/${gameId}`);
}
