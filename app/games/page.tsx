import Link from "next/link";
import { db } from "@/lib/db";
import DeleteGameButton from "./DeleteGameButton";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const games = await db.game.findMany({
    orderBy: { importedAt: "desc" },
    include: { _count: { select: { moves: true } } },
  });

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold">Games ({games.length})</h1>
        <Link
          href="/import"
          className="ml-auto text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
        >
          Import
        </Link>
      </div>

      {games.length === 0 ? (
        <p className="text-gray-500">
          No games yet.{" "}
          <Link href="/import" className="text-blue-600 hover:underline">
            Import some PGNs
          </Link>
          .
        </p>
      ) : (
        <div className="divide-y border rounded">
          {games.map((game) => (
            <div key={game.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{game.white}</span>
                <span className="mx-2 text-gray-400">vs</span>
                <span className="font-medium">{game.black}</span>
                {game.opening && (
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {game.opening}
                  </p>
                )}
              </div>
              <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded shrink-0">
                {game.result}
              </span>
              <span className="text-sm text-gray-400 shrink-0">
                {game._count.moves} plies
              </span>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(game.importedAt).toLocaleDateString()}
              </span>
              <Link
                href={`/games/${game.id}`}
                className="text-sm text-blue-600 hover:underline shrink-0"
              >
                View →
              </Link>
              <DeleteGameButton gameId={game.id} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
