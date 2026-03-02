import Link from "next/link";
import { db } from "@/lib/db";
import { MOTIF_META } from "@/lib/motifMeta";

export const dynamic = "force-dynamic";

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const motifFilter = sp.motif ?? null;

  const findings = await db.finding.findMany({
    where: motifFilter ? { motif: motifFilter } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      move: {
        include: {
          game: { select: { id: true, white: true, black: true, result: true } },
        },
      },
    },
  });

  const title = motifFilter
    ? (MOTIF_META[motifFilter]?.label ?? motifFilter)
    : "All findings";

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Home</Link>
        <h1 className="text-xl font-bold">{title}</h1>
        {motifFilter && MOTIF_META[motifFilter]?.lichessUrl && (
          <a
            href={MOTIF_META[motifFilter].lichessUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
          >
            Train on Lichess ↗
          </a>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="text-gray-500">No findings found.</p>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => {
            const game = f.move.game;
            const ply = f.move.ply;
            const moveLabel = `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"} ${f.move.san}`;
            return (
              <div key={f.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {game.white} vs {game.black}{" "}
                      <span className="text-gray-400 font-mono text-xs">{game.result}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{moveLabel}</p>
                    <p className="text-sm text-gray-700 mt-1.5">{f.reason}</p>
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                      {f.swingCp !== null && (
                        <span>Swing: {f.swingCp > 0 ? "+" : ""}{f.swingCp}cp</span>
                      )}
                      <span>Confidence: {f.confidence}%</span>
                    </div>
                  </div>
                  <Link
                    href={`/games/${game.id}`}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    View game →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
