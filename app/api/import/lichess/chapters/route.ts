import { NextRequest, NextResponse } from "next/server";
import { fetchChapters } from "@/lib/lichess";

export async function GET(req: NextRequest) {
  const studyId = req.nextUrl.searchParams.get("studyId");
  if (!studyId)
    return NextResponse.json({ error: "studyId is required" }, { status: 400 });

  try {
    const chapters = await fetchChapters(studyId);
    return NextResponse.json({ chapters });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
