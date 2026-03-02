"use client";

import dynamic from "next/dynamic";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div style={{ width: 200, height: 200 }} className="bg-gray-100 rounded animate-pulse" /> }
);

export default function FindingBoard({
  fen,
  bestMoveUci,
  orientation,
}: {
  fen: string;
  bestMoveUci: string | null;
  orientation: "white" | "black";
}) {
  // Parse UCI "c7c6" → Arrow { startSquare, endSquare, color }
  const arrows =
    bestMoveUci && bestMoveUci.length >= 4
      ? [{ startSquare: bestMoveUci.slice(0, 2), endSquare: bestMoveUci.slice(2, 4), color: "#15803d" }]
      : [];

  return (
    <div className="shrink-0">
      <Chessboard
        options={{
          position: fen,
          boardStyle: { width: "200px", maxWidth: "200px" },
          allowDragging: false,
          boardOrientation: orientation,
          arrows,
        }}
      />
    </div>
  );
}
