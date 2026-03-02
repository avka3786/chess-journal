import { NextRequest, NextResponse } from "next/server";
import { fetchChapterPgn, tokenizePgn } from "@/lib/lichess";

const MY_USERNAME = "avka3786";

function getHeader(pgn: string, tag: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m?.[1] || undefined;
}

function detectMyColor(pgn: string): "white" | "black" | null {
  const white = getHeader(pgn, "White") ?? "";
  const black = getHeader(pgn, "Black") ?? "";
  if (white.toLowerCase() === MY_USERNAME.toLowerCase()) return "white";
  if (black.toLowerCase() === MY_USERNAME.toLowerCase()) return "black";
  return null;
}

export async function POST(req: NextRequest) {
  let body: { studyId?: string; chapterId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { studyId, chapterId } = body;
  if (!studyId || !chapterId)
    return NextResponse.json(
      { error: "studyId and chapterId are required" },
      { status: 400 }
    );

  let pgn: string;
  try {
    pgn = await fetchChapterPgn(studyId, chapterId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to fetch chapter: ${msg}` },
      { status: 502 }
    );
  }

  const detectedColor = detectMyColor(pgn);
  const white = getHeader(pgn, "White") ?? "?";
  const black = getHeader(pgn, "Black") ?? "?";

  const tokens = tokenizePgn(pgn);
  let totalComments = 0;
  let whiteComments = 0;
  let blackComments = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].comment) continue;
    totalComments++;
    const ply = i + 1;
    if (ply % 2 === 1) whiteComments++;
    else blackComments++;
  }

  const myComments =
    detectedColor === "white"
      ? whiteComments
      : detectedColor === "black"
      ? blackComments
      : null;

  return NextResponse.json({
    detectedColor,
    white,
    black,
    totalComments,
    whiteComments,
    blackComments,
    myComments,
  });
}
