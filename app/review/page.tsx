import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const next = await db.game.findFirst({
    where: { reviewedAt: null },
    orderBy: { importedAt: "desc" },
    select: { id: true },
  });

  if (next) redirect(`/review/${next.id}`);

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <span className="text-5xl">🎉</span>
      <h1 className="text-2xl font-bold">All caught up!</h1>
      <p className="text-gray-400">Every imported game has been reviewed.</p>
      <Link
        href="/import"
        className="mt-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
      >
        Import more games
      </Link>
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Home
      </Link>
    </main>
  );
}
