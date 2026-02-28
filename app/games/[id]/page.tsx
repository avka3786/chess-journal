import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import GameViewer from "./GameViewer";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const game = await db.game.findUnique({
    where: { id },
    include: {
      moves: {
        orderBy: { ply: "asc" },
        include: { annotations: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!game) notFound();

  return (
    <main className="max-w-7xl mx-auto p-4">
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
