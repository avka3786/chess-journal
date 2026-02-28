-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moveId" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "tags" TEXT,
    "severity" INTEGER,
    CONSTRAINT "Annotation_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "Move" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
