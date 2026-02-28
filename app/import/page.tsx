"use client";

import { useState } from "react";
import Link from "next/link";

export default function ImportPage() {
  const [pgn, setPgn] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    imported: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");

  async function handleImport() {
    if (!pgn.trim()) return;
    setLoading(true);
    setError("");
    setStatus(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setStatus(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPgn((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold">Import PGN</h1>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Upload .pgn file
        </label>
        <input
          type="file"
          accept=".pgn"
          onChange={handleFile}
          className="text-sm"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Or paste PGN text
        </label>
        <textarea
          className="w-full h-64 border rounded p-2 font-mono text-sm resize-y"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder={`[Event "Live Chess"]\n[Site "Chess.com"]\n[White "player1"]\n...`}
        />
      </div>

      <button
        onClick={handleImport}
        disabled={loading || !pgn.trim()}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700"
      >
        {loading ? "Importing…" : "Import"}
      </button>

      {status && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-medium text-green-800">
            Imported {status.imported} game{status.imported !== 1 ? "s" : ""}
            {status.failed > 0 && `, ${status.failed} failed`}
          </p>
          {status.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-gray-600 cursor-pointer">
                Show errors
              </summary>
              <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                {status.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
          <Link
            href="/games"
            className="text-sm text-blue-600 hover:underline mt-2 inline-block"
          >
            View games →
          </Link>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
    </main>
  );
}
