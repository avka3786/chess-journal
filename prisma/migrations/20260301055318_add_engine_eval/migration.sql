-- AlterTable
ALTER TABLE "Game" ADD COLUMN "stockfishDepth" INTEGER;
ALTER TABLE "Game" ADD COLUMN "stockfishMaxFindings" INTEGER;
ALTER TABLE "Game" ADD COLUMN "stockfishReviewedAt" DATETIME;

-- CreateTable
CREATE TABLE "EngineEval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moveId" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "threads" INTEGER NOT NULL,
    "hashMb" INTEGER NOT NULL,
    "evalCp" INTEGER,
    "evalMate" INTEGER,
    "pv" TEXT,
    "bestMoveUci" TEXT,
    "evalType" TEXT,
    CONSTRAINT "EngineEval_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "Move" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineEval_moveId_key" ON "EngineEval"("moveId");
