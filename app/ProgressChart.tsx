"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type WeekPoint = {
  week: string;
  STEP1: number;
  STEP2: number;
  STEP3: number;
  STEP4: number;
};

export type StepTrend = {
  slope: number; // positive = more mistakes over time, negative = improving
  total: number;
};

type Props = {
  data: WeekPoint[];
  trends: Record<string, StepTrend>;
};

const STEP_META = [
  { key: "STEP1", label: "Step 1 – Threat", color: "#f43f5e" },
  { key: "STEP2", label: "Step 2 – Forcing", color: "#fb923c" },
  { key: "STEP3", label: "Step 3 – Plan", color: "#facc15" },
  { key: "STEP4", label: "Step 4 – Blunder-check", color: "#38bdf8" },
] as const;

function TrendBadge({ slope, total }: StepTrend) {
  if (total === 0)
    return <span className="text-xs text-gray-600">no data</span>;
  if (Math.abs(slope) < 0.05)
    return (
      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
        → Stable
      </span>
    );
  if (slope > 0)
    return (
      <span className="text-xs bg-rose-950 text-rose-400 px-2 py-0.5 rounded-full">
        ↑ More mistakes
      </span>
    );
  return (
    <span className="text-xs bg-green-950 text-green-400 px-2 py-0.5 rounded-full">
      ↓ Improving
    </span>
  );
}

export default function ProgressChart({ data, trends }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">
        No annotations yet — complete reviews to see your progress chart.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Trend summary row */}
      <div className="grid grid-cols-4 gap-3">
        {STEP_META.map(({ key, label }) => (
          <div
            key={key}
            className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50"
          >
            <p className="text-xs text-gray-400 mb-1 truncate">{label}</p>
            <TrendBadge {...(trends[key] ?? { slope: 0, total: 0 })} />
          </div>
        ))}
      </div>

      {/* Line chart */}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="week"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e5e7eb", marginBottom: 4 }}
            itemStyle={{ color: "#e5e7eb" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "#9ca3af" }}
          />
          {STEP_META.map(({ key, label, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={label}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
