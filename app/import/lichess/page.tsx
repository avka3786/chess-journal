"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Chapter = { id: string; name: string };

type PageStep = "url" | "chapters" | "importing";

/** Re-implement URL parsing client-side (no Node deps — pure regex). */
function parseLichessUrl(
  url: string
): { studyId: string; chapterId?: string } | null {
  const m = url
    .trim()
    .match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  if (!m) return null;
  return { studyId: m[1], chapterId: m[2] };
}

export default function LichessImportPage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [step, setStep] = useState<PageStep>("url");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [studyId, setStudyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFetch() {
    setError("");
    const parsed = parseLichessUrl(url);
    if (!parsed) {
      setError(
        'Invalid URL. Expected format: https://lichess.org/study/AAAAAAAA or …/AAAAAAAA/BBBBBBBB'
      );
      return;
    }

    setStudyId(parsed.studyId);
    setLoading(true);

    try {
      if (parsed.chapterId) {
        // Chapter URL — import immediately
        await doImport(parsed.studyId, parsed.chapterId);
      } else {
        // Study URL — fetch chapter list
        const res = await fetch(
          `/api/import/lichess/chapters?studyId=${parsed.studyId}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch chapters");
        setChapters(data.chapters as Chapter[]);
        setSelectedChapterId(data.chapters[0]?.id ?? "");
        setStep("chapters");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doImport(sid: string, cid: string) {
    setStep("importing");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/import/lichess/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: sid, chapterId: cid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      router.push(`/games/${data.gameId}?from=lichess`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep(chapters.length > 0 ? "chapters" : "url");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/import" className="text-sm text-blue-600 hover:underline">
          ← Import
        </Link>
        <h1 className="text-2xl font-bold">Import from Lichess Study</h1>
      </div>

      {step === "url" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Paste a Lichess Study URL. Comments in the study will be
            automatically classified into your learning steps.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">
              Lichess Study or Chapter URL
            </label>
            <input
              type="url"
              className="w-full border rounded px-3 py-2 text-sm font-mono"
              placeholder="https://lichess.org/study/AAAAAAAA or …/BBBBBBBB"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            />
          </div>

          <button
            onClick={handleFetch}
            disabled={loading || !url.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-blue-700"
          >
            {loading ? "Fetching…" : "Continue"}
          </button>
        </div>
      )}

      {step === "chapters" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select a chapter to import:
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">Chapter</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep("url")}
              className="border px-4 py-2 rounded text-sm hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => doImport(studyId, selectedChapterId)}
              disabled={loading || !selectedChapterId}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? "Importing…" : "Import chapter"}
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <p className="text-sm text-gray-500">Importing from Lichess…</p>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </main>
  );
}
