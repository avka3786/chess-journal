"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LichessQuickImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  function handleGo() {
    const trimmed = url.trim();
    if (!trimmed) return;
    router.push(`/import/lichess?url=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="ml-20 mt-5 flex gap-2 max-w-lg">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleGo()}
        placeholder="https://lichess.org/study/…"
        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
      />
      <button
        onClick={handleGo}
        disabled={!url.trim()}
        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
      >
        Import study
      </button>
    </div>
  );
}
