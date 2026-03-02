"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DrillEntry } from "@/lib/drills";

export type { DrillEntry };

export type DrillsData = {
  analyzedGames: number;
  analyzedMoves: number;
  lastUpdated: string | null;
  drill1: DrillEntry | null;
  drill2: DrillEntry | null;
};

function DrillRow({
  drill,
  index,
  source,
  examplesHref,
  empty,
}: {
  drill: DrillEntry | null;
  index: number;
  source: string;
  examplesHref?: string;
  empty?: React.ReactNode;
}) {
  if (!drill) {
    return (
      <div className="border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-600 mb-1">{source}</p>
        <p className="text-gray-500 text-sm">{empty}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border border-gray-800 rounded-lg p-3">
      <span className="text-2xl font-bold tabular-nums text-gray-600 w-6 shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{source}</p>
        <p className="font-semibold text-sm">{drill.label}</p>
        <p className="text-xs text-gray-500">
          {drill.count} occurrence{drill.count !== 1 ? "s" : ""} · score{" "}
          {Math.round(drill.score)}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {examplesHref && (
          <Link
            href={examplesHref}
            className="text-xs border border-gray-700 px-2.5 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            Examples
          </Link>
        )}
        {drill.lichessUrl && (
          <a
            href={drill.lichessUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1 rounded transition-colors"
          >
            Train ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function WeeklyDrills({ data }: { data: DrillsData }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  async function handleRunAnalysis() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/analyze/weekly", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Analysis failed");
      setRunResult(
        d.analyzed === 0
          ? "All recent games already analyzed."
          : `Analyzed ${d.analyzed} game${d.analyzed !== 1 ? "s" : ""}. Refreshing…`
      );
      if (d.analyzed > 0) router.refresh();
    } catch (e) {
      setRunResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  const noDrills = !data.drill1 && !data.drill2;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="font-bold text-lg">This week&apos;s drills</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Drill 1 from your notes · Drill 2 from Stockfish (last 7 days)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleRunAnalysis}
            disabled={running}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-medium transition-colors"
          >
            {running ? "Analyzing…" : "Run weekly analysis"}
          </button>
          {data.lastUpdated && (
            <p className="text-xs text-gray-600">
              Last: {new Date(data.lastUpdated).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-5 text-xs text-gray-500">
        <span>
          {data.analyzedGames} game{data.analyzedGames !== 1 ? "s" : ""} analyzed
        </span>
        <span>·</span>
        <span>{data.analyzedMoves} moves (depth 14)</span>
      </div>

      {noDrills ? (
        <p className="text-gray-500 text-sm">
          No data yet. Review games to get Drill 1, or run Stockfish analysis
          for Drill 2.
        </p>
      ) : (
        <div className="space-y-3">
          <DrillRow
            drill={data.drill1}
            index={0}
            source="From your notes"
            examplesHref={data.drill1 ? `/annotations?theme=${data.drill1.motif}` : undefined}
            empty="Review games and add annotations to get Drill 1."
          />
          <DrillRow
            drill={data.drill2}
            index={1}
            source="From Stockfish"
            examplesHref={data.drill2 ? `/findings?motif=${data.drill2.motif}` : undefined}
            empty="Run weekly analysis to get Drill 2."
          />
        </div>
      )}

      {runResult && (
        <p className="mt-3 text-xs text-gray-400">{runResult}</p>
      )}
    </div>
  );
}
