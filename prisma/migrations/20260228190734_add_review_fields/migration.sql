-- AlterTable
ALTER TABLE "Game" ADD COLUMN "nextHabit" TEXT;
ALTER TABLE "Game" ADD COLUMN "reviewDurationMin" INTEGER;
ALTER TABLE "Game" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "Game" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Game" ADD COLUMN "weeklyDrill" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Move" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "ply" INTEGER NOT NULL,
    "san" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "fenAfter" TEXT NOT NULL,
    "selectedForReview" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Move_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Move" ("fenAfter", "fenBefore", "gameId", "id", "ply", "san") SELECT "fenAfter", "fenBefore", "gameId", "id", "ply", "san" FROM "Move";
DROP TABLE "Move";
ALTER TABLE "new_Move" RENAME TO "Move";
CREATE UNIQUE INDEX "Move_gameId_ply_key" ON "Move"("gameId", "ply");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
