import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import ReviewFlow from "./ReviewFlow";

export const dynamic = "force-dynamic";

export default async function ReviewGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: rawId } = await params;
  const gameId = parseInt(rawId, 10);
  if (isNaN(gameId)) notFound();

  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      moves: {
        orderBy: { ply: "asc" },
        include: { annotations: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!game) notFound();

  return <ReviewFlow game={game} />;
}
