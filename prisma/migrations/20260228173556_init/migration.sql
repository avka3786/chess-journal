-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'chess.com',
    "white" TEXT NOT NULL,
    "black" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "timeControl" TEXT,
    "eco" TEXT,
    "opening" TEXT,
    "pgn" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Move" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "ply" INTEGER NOT NULL,
    "san" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "fenAfter" TEXT NOT NULL,
    CONSTRAINT "Move_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Move_gameId_ply_key" ON "Move"("gameId", "ply");
