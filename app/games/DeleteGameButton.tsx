"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/lib/actions";

export default function DeleteGameButton({ gameId }: { gameId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm("Delete this game and all its annotations? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteGame(gameId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40 shrink-0"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
