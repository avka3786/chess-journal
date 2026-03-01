import Link from "next/link";
import { db } from "@/lib/db";
import ProgressChart, { type WeekPoint, type StepTrend } from "./ProgressChart";

export const dynamic = "force-dynamic";

type BucketKey = "STEP1" | "STEP2" | "STEP3" | "STEP4";

const BUCKET_META: Record<
  BucketKey,
  { label: string; sublabel: string; color: string }
> = {
  STEP1: { label: "Step 1", sublabel: "Missed threat / intent", color: "bg-rose-500" },
  STEP2: { label: "Step 2", sublabel: "Missed forcing move", color: "bg-orange-400" },
  STEP3: { label: "Step 3", sublabel: "Wrong plan", color: "bg-yellow-400" },
  STEP4: { label: "Step 4", sublabel: "No blunder-check", color: "bg-sky-500" },
};

const BUCKET_KEYS = ["STEP1", "STEP2", "STEP3", "STEP4"] as BucketKey[];

const HABIT_SUGGESTIONS: Record<BucketKey, string> = {
  STEP1: "Before moving: name opponent's threat/intent in one phrase.",
  STEP2: "CCT scan every move: checks, captures, threats.",
  STEP3: "If no tactics: improve worst piece / target a weakness.",
  STEP4: "After choosing a move: list opponent's best CCT reply.",
};

export default async function Home() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fortnightAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);

  const [
    totalGames,
    totalReviewed,
    gamesThisWeek,
    reviewedThisWeek,
    nextGameRow,
    recentBuckets,
    lastReviewedGame,
    recentTagAnnotations,
    totalAnnotations,
    rawProgressAnnotations,
  ] = await Promise.all([
    db.game.count(),
    db.game.count({ where: { reviewedAt: { not: null } } }),
    db.game.count({
      where: {
        OR: [
          { playedAt: { gte: weekAgo } },
          { playedAt: null, importedAt: { gte: weekAgo } },
        ],
      },
    }),
    db.game.count({ where: { reviewedAt: { gte: weekAgo } } }),
    db.game.findFirst({
      where: { reviewedAt: null },
      orderBy: { importedAt: "desc" },
      select: { id: true },
    }),
    db.annotation.groupBy({
      by: ["bucket"],
      where: { createdAt: { gte: fortnightAgo } },
      _count: { bucket: true },
    }),
    db.game.findFirst({
      where: { reviewedAt: { not: null }, nextHabit: { not: null } },
      orderBy: { reviewedAt: "desc" },
      select: { nextHabit: true, weeklyDrill: true },
    }),
    db.annotation.findMany({
      where: { createdAt: { gte: monthAgo }, tags: { not: null } },
      select: { tags: true },
    }),
    db.annotation.count(),
    db.annotation.findMany({
      where: { createdAt: { gte: twelveWeeksAgo } },
      select: { createdAt: true, bucket: true },
    }),
  ]);

  // ── Focus step ─────────────────────────────────────────────────────────────
  const bucketMap = Object.fromEntries(
    recentBuckets.map((b) => [b.bucket, b._count.bucket])
  );
  const focusBucket =
    (recentBuckets.reduce<{ bucket: string; count: number } | null>(
      (best, b) =>
        !best || b._count.bucket > best.count
          ? { bucket: b.bucket, count: b._count.bucket }
          : best,
      null
    )?.bucket as BucketKey | null) ?? null;
  const maxBucketCount = Math.max(...Object.values(bucketMap), 1);

  // ── Top tags ───────────────────────────────────────────────────────────────
  const tagFreq: Record<string, number> = {};
  for (const ann of recentTagAnnotations) {
    for (const raw of (ann.tags ?? "").split(",")) {
      const t = raw.trim().toLowerCase();
      if (t) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Progress over time ─────────────────────────────────────────────────────
  // Build ordered list of the last 12 ISO-weeks (Mon–Sun labels)
  function isoWeekKey(d: Date): string {
    // Monday of that week
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${monthNames[mon.getMonth()]} ${mon.getDate()}`;
  }

  // Generate 12 week-start dates in order
  const weekKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const key = isoWeekKey(d);
    if (!weekKeys.includes(key)) weekKeys.push(key);
  }

  const weekMap: Record<string, WeekPoint> = {};
  for (const key of weekKeys) {
    weekMap[key] = { week: key, STEP1: 0, STEP2: 0, STEP3: 0, STEP4: 0 };
  }
  for (const ann of rawProgressAnnotations) {
    const key = isoWeekKey(ann.createdAt);
    if (weekMap[key] && (ann.bucket === "STEP1" || ann.bucket === "STEP2" || ann.bucket === "STEP3" || ann.bucket === "STEP4")) {
      weekMap[key][ann.bucket]++;
    }
  }
  const progressData: WeekPoint[] = weekKeys.map((k) => weekMap[k]);

  // Linear regression slope per step
  function slope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    values.forEach((y, x) => {
      num += (x - xMean) * (y - yMean);
      den += (x - xMean) ** 2;
    });
    return den === 0 ? 0 : num / den;
  }

  const stepTrends: Record<string, StepTrend> = {};
  for (const key of ["STEP1", "STEP2", "STEP3", "STEP4"] as const) {
    const vals = progressData.map((p) => p[key]);
    stepTrends[key] = { slope: slope(vals), total: vals.reduce((s, v) => s + v, 0) };
  }

  // ── Habit ──────────────────────────────────────────────────────────────────
  const habitText =
    lastReviewedGame?.nextHabit ??
    (focusBucket ? HABIT_SUGGESTIONS[focusBucket] : null);
  const habitIsPersonal = !!lastReviewedGame?.nextHabit;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative border-b border-gray-800 overflow-hidden"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#111827 0% 25%, #0f172a 0% 50%)",
          backgroundSize: "48px 48px",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/60 via-gray-950/80 to-gray-950" />
        <div className="relative max-w-4xl mx-auto px-8 py-14">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-5xl leading-none select-none">♟</span>
            <h1 className="text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Chess Journal
            </h1>
          </div>
          <p className="text-gray-400 text-xl ml-20 mb-8">
            Track your mistakes. Understand your patterns. Improve deliberately.
          </p>
          <div className="flex gap-3 ml-20">
            <Link
              href="/import"
              className="bg-white text-gray-950 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Import PGN
            </Link>
            <Link
              href="/games"
              className="border border-gray-600 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
            >
              View Games
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
        {/* ── A) Review Queue ─────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-bold text-lg">Review Queue</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                Reviewed this week:{" "}
                <span className="text-white font-semibold">
                  {reviewedThisWeek}
                </span>{" "}
                /{" "}
                <span className="text-white font-semibold">
                  {gamesThisWeek}
                </span>{" "}
                game{gamesThisWeek !== 1 ? "s" : ""}
              </p>
            </div>

            {nextGameRow ? (
              <Link
                href="/review"
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors shrink-0 flex items-center gap-2"
              >
                <span>▶</span> Review next game (15 min)
              </Link>
            ) : totalGames > 0 ? (
              <div className="text-right">
                <p className="text-green-400 font-semibold">All caught up! 🎉</p>
                <Link
                  href="/import"
                  className="text-sm text-gray-400 hover:underline"
                >
                  Import more games →
                </Link>
              </div>
            ) : (
              <Link
                href="/import"
                className="border border-gray-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-800"
              >
                Import your first game
              </Link>
            )}
          </div>

          {/* Week progress bar */}
          {gamesThisWeek > 0 && (
            <div className="mt-4 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (reviewedThisWeek / gamesThisWeek) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* ── B, C, D three-column grid ───────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">
          {/* B) Focus Step */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-bold mb-0.5">Current Focus</h2>
            <p className="text-gray-500 text-xs mb-4">Last 14 days</p>

            {focusBucket ? (
              <>
                <p className="text-2xl font-bold text-blue-400 mb-1">
                  {BUCKET_META[focusBucket].label}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {BUCKET_META[focusBucket].sublabel}
                </p>
                <div className="space-y-2.5">
                  {BUCKET_KEYS.map((key) => {
                    const count = bucketMap[key] ?? 0;
                    const isFocus = key === focusBucket;
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-12 text-gray-400 shrink-0">
                          {BUCKET_META[key].label}
                        </span>
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${BUCKET_META[key].color} ${isFocus ? "opacity-100" : "opacity-40"}`}
                            style={{
                              width: `${(count / maxBucketCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="w-4 text-right text-gray-400">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-sm">
                No annotations in the last 14 days. Start reviewing to see your
                focus area.
              </p>
            )}
          </div>

          {/* C) Habit */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-bold mb-0.5">Next-game habit</h2>
            <p className="text-gray-500 text-xs mb-4">
              {habitIsPersonal
                ? "From your last review"
                : focusBucket
                ? "Based on your focus step"
                : "Complete a review to unlock"}
            </p>

            {habitText ? (
              <p className="text-gray-100 text-sm leading-relaxed border-l-2 border-blue-500 pl-3">
                {habitText}
              </p>
            ) : (
              <p className="text-gray-500 text-sm">
                Complete a review to get a personalised habit.
              </p>
            )}

            {lastReviewedGame?.weeklyDrill && (
              <div className="mt-5 pt-4 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-1">This week&apos;s drill</p>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {lastReviewedGame.weeklyDrill}
                </p>
              </div>
            )}
          </div>

          {/* D) Top Tags */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-bold mb-0.5">Top tags</h2>
            <p className="text-gray-500 text-xs mb-4">Last 30 days</p>

            {topTags.length > 0 ? (
              <div className="space-y-2">
                {topTags.map(([tag, count], i) => (
                  <div key={tag} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-gray-600 w-4">{i + 1}.</span>
                    <span className="flex-1 text-gray-200">{tag}</span>
                    <span className="text-xs text-gray-400 tabular-nums font-mono">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No tagged annotations yet.</p>
            )}
          </div>
        </div>

        {/* ── E) Progress Over Time ───────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="font-bold text-lg">Progress Over Time</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Mistakes per step — weekly, last 12 weeks
            </p>
          </div>
          <ProgressChart data={progressData} trends={stepTrends} />
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {(
            [
              { label: "Games imported", value: totalGames, icon: "♟" },
              { label: "Games reviewed", value: totalReviewed, icon: "✓" },
              { label: "Annotations", value: totalAnnotations, icon: "◉" },
            ] as const
          ).map(({ label, value, icon }) => (
            <div
              key={label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <span className="text-gray-500 text-lg">{icon}</span>
              <p className="text-4xl font-bold tabular-nums mt-1">{value}</p>
              <p className="text-gray-400 text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
