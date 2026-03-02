import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import GameViewer from "./GameViewer";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const game = await db.game.findUnique({
    where: { id },
    include: {
      moves: {
        orderBy: { ply: "asc" },
        include: {
          annotations: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              bucket: true,
              note: true,
              tags: true,
              severity: true,
              source: true,
              rawComment: true,
              confidence: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!game) notFound();

  const fromLichess = sp["from"] === "lichess";

  return (
    <main className="max-w-7xl mx-auto p-4">
      {fromLichess && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded flex items-center justify-between">
          <p className="text-sm text-orange-800">
            Lichess study imported successfully. Comments have been
            auto-classified — review and adjust annotations as needed.
          </p>
          <Link
            href={game.externalUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-orange-700 underline hover:no-underline ml-4 shrink-0"
          >
            View on Lichess →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/games" className="text-sm text-blue-600 hover:underline">
          ← Games
        </Link>
        <h1 className="text-lg font-bold">
          {game.white} vs {game.black}
        </h1>
        <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
          {game.result}
        </span>
        {game.timeControl && (
          <span className="text-sm text-gray-500">{game.timeControl}</span>
        )}
        {game.opening && (
          <span className="text-sm text-gray-400 italic">{game.opening}</span>
        )}
        {game.source === "lichess" && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
            Lichess
          </span>
        )}
        {game.playedAt && (
          <span className="text-sm text-gray-400 ml-auto">
            {new Date(game.playedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <GameViewer game={game} />
    </main>
  );
}
