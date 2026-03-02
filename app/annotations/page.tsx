import Link from "next/link";
import { db } from "@/lib/db";
import { noteToThemes } from "@/lib/drills";
import { MOTIF_META } from "@/lib/motifMeta";
import FindingBoard from "@/app/findings/FindingBoard";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<string, string> = {
  STEP1: "Step 1 — Missed threat",
  STEP2: "Step 2 — Missed forcing move",
  STEP3: "Step 3 — Wrong plan",
  STEP4: "Step 4 — No blunder-check",
};

export default async function AnnotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const themeFilter = sp.theme ?? null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const allAnnotations = await db.annotation.findMany({
    where: { createdAt: { gte: weekAgo } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      move: {
        include: {
          game: { select: { id: true, white: true, black: true, result: true } },
          engineEval: { select: { bestMoveUci: true } },
        },
      },
    },
  });

  // Filter to those whose note maps to the requested theme
  const annotations = themeFilter
    ? allAnnotations.filter((ann) =>
        noteToThemes(ann.note, ann.bucket).some((h) => h.themeKey === themeFilter)
      )
    : allAnnotations;

  const themeLabel = themeFilter
    ? (MOTIF_META[themeFilter]?.label ?? themeFilter)
    : null;

  const title = themeLabel ? `Examples: ${themeLabel}` : "Recent annotations";

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Home
        </Link>
        <h1 className="text-xl font-bold">{title}</h1>
        {themeFilter && MOTIF_META[themeFilter]?.lichessUrl && (
          <a
            href={MOTIF_META[themeFilter].lichessUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
          >
            Train on Lichess ↗
          </a>
        )}
      </div>

      {annotations.length === 0 ? (
        <p className="text-gray-500">No annotations found for the last 7 days.</p>
      ) : (
        <div className="space-y-4">
          {annotations.map((ann) => {
            const game = ann.move.game;
            const ply = ann.move.ply;
            const moveLabel = `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"} ${ann.move.san}`;
            const orientation: "white" | "black" = ply % 2 === 1 ? "white" : "black";
            const bestMoveUci = ann.move.engineEval?.bestMoveUci ?? null;

            return (
              <div
                key={ann.id}
                className="border rounded-lg p-4 flex gap-5 items-start"
              >
                <FindingBoard
                  fen={ann.move.fenBefore}
                  bestMoveUci={bestMoveUci}
                  orientation={orientation}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        {game.white} vs {game.black}{" "}
                        <span className="text-gray-400 font-mono text-xs">
                          {game.result}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        {moveLabel}
                      </p>
                    </div>
                    <Link
                      href={`/games/${game.id}`}
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      View game →
                    </Link>
                  </div>

                  <p className="text-sm text-gray-700 mt-3">{ann.note}</p>

                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {BUCKET_LABEL[ann.bucket] ?? ann.bucket}
                    </span>
                    {bestMoveUci && (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 font-mono">
                        Best: {bestMoveUci.slice(0, 2)} → {bestMoveUci.slice(2, 4)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
