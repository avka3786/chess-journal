"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Chapter = { id: string; name: string };
type MyColor = "white" | "black";
type PageStep = "url" | "chapters" | "preview" | "importing";

type PreviewData = {
  detectedColor: MyColor | null;
  white: string;
  black: string;
  totalComments: number;
  whiteComments: number;
  blackComments: number;
  myComments: number | null;
};

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
  const searchParams = useSearchParams();

  const [url, setUrl] = useState("");
  const [step, setStep] = useState<PageStep>("url");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [studyId, setStudyId] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [myColor, setMyColor] = useState<MyColor>("white");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-start when a URL is passed as a query param (e.g. from the landing page)
  useEffect(() => {
    const preloaded = searchParams.get("url");
    if (preloaded) {
      setUrl(preloaded);
      const parsed = parseLichessUrl(preloaded);
      if (parsed) {
        setStudyId(parsed.studyId);
        if (parsed.chapterId) {
          fetchPreview(parsed.studyId, parsed.chapterId);
        } else {
          // Fetch chapter list automatically
          setLoading(true);
          fetch(`/api/import/lichess/chapters?studyId=${parsed.studyId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.error) throw new Error(data.error);
              setChapters(data.chapters as Chapter[]);
              setSelectedChapterId(data.chapters[0]?.id ?? "");
              setStep("chapters");
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFetch() {
    setError("");
    const parsed = parseLichessUrl(url);
    if (!parsed) {
      setError(
        "Invalid URL. Expected: https://lichess.org/study/AAAAAAAA or …/AAAAAAAA/BBBBBBBB"
      );
      return;
    }

    setStudyId(parsed.studyId);
    setLoading(true);

    try {
      if (parsed.chapterId) {
        // Chapter URL — go straight to preview
        await fetchPreview(parsed.studyId, parsed.chapterId);
      } else {
        // Study URL — fetch chapter list first
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

  async function fetchPreview(sid: string, cid: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/import/lichess/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: sid, chapterId: cid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch preview");
      const p = data as PreviewData;
      setPreview(p);
      // Pre-select detected color; fallback to white
      setMyColor(p.detectedColor ?? "white");
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    const cid = selectedChapterId || parseLichessUrl(url)?.chapterId;
    if (!cid) return;

    setStep("importing");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/import/lichess/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId, chapterId: cid, myColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      router.push(`/games/${data.gameId}?from=lichess`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  const importCount =
    preview
      ? myColor === "white"
        ? preview.whiteComments
        : preview.blackComments
      : 0;

  return (
    <main className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/import" className="text-sm text-blue-600 hover:underline">
          ← Import
        </Link>
        <h1 className="text-2xl font-bold">Import from Lichess Study</h1>
      </div>

      {/* Step: URL input */}
      {step === "url" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Paste a Lichess Study URL. Only your mistakes will be imported as
            annotations.
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

      {/* Step: Chapter picker */}
      {step === "chapters" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Select a chapter to import:</p>
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
              onClick={() => fetchPreview(studyId, selectedChapterId)}
              disabled={loading || !selectedChapterId}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? "Loading…" : "Preview"}
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* Players */}
          <div className="border rounded p-3 text-sm space-y-1 bg-gray-50">
            <div className="flex gap-2 items-center">
              <span className="w-3.5 h-3.5 rounded-sm bg-white border border-gray-300 shrink-0" />
              <span className="font-medium">{preview.white}</span>
              <span className="text-gray-400 text-xs">· {preview.whiteComments} comment{preview.whiteComments !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-3.5 h-3.5 rounded-sm bg-gray-900 border border-gray-600 shrink-0" />
              <span className="font-medium">{preview.black}</span>
              <span className="text-gray-400 text-xs">· {preview.blackComments} comment{preview.blackComments !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-gray-400 pt-1">
              {preview.totalComments} total comment{preview.totalComments !== 1 ? "s" : ""} in chapter
            </p>
          </div>

          {/* Color selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {preview.detectedColor
                ? `You are playing as ${preview.detectedColor === "white" ? "White" : "Black"} (detected)`
                : "Which color were you playing?"}
            </label>
            <div className="flex gap-2">
              {(["white", "black"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setMyColor(c)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 border rounded text-sm transition-colors ${
                    myColor === c
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-sm shrink-0 ${
                      c === "white"
                        ? "bg-white border border-gray-300"
                        : "bg-gray-900 border border-gray-600"
                    }`}
                  />
                  {c === "white" ? "I was White" : "I was Black"}
                </button>
              ))}
            </div>
          </div>

          {/* Import summary */}
          <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Will import{" "}
            <span className="font-semibold">{importCount}</span> annotation
            {importCount !== 1 ? "s" : ""} from your moves
            {preview.totalComments - importCount > 0 && (
              <span className="text-blue-500">
                {" "}
                ({preview.totalComments - importCount} opponent comment
                {preview.totalComments - importCount !== 1 ? "s" : ""} skipped)
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() =>
                chapters.length > 0 ? setStep("chapters") : setStep("url")
              }
              className="border px-4 py-2 rounded text-sm hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={doImport}
              disabled={loading || importCount === 0}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {loading
                ? "Importing…"
                : importCount === 0
                ? "No annotations to import"
                : `Import ${importCount} annotation${importCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
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
