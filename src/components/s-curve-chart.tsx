"use client";
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis } from "recharts";
import { distributeActualProgress } from "@/lib/actual-progress-distribution";

interface MonthlyProgress {
  monthDate: string;
  plannedPct: number;
  actualPct: number | null;
}

interface SCurveChartProps {
  data: MonthlyProgress[];
  // Optional: the overall actual progress (0-1) of the root WBS.
  // If provided, the actual curve will be computed by distributing this value
  // across the time axis (monthly intervals) up to today.
  overallActual?: number;
}

// S-curve chart showing plan vs actual progress.
//
// Uses distributeActualProgress() to compute the actual curve when only
// the current overall percentage is known. The actual line:
//   - Starts at (0, 0)
//   - Ends at (today, overallActual)
//   - Is distributed proportionally across past months based on elapsed time
//   - Future months get null (not yet achieved)
export function SCurveChart({ data, overallActual }: SCurveChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        داده‌ای موجود نیست
      </div>
    );
  }

  // If overallActual is provided, distribute it across the time axis
  const processedData =
    overallActual !== undefined && overallActual !== null
      ? distributeActualProgress(data, overallActual)
      : data;

  // Convert to display format - sort by date
  const sorted = [...processedData].sort(
    (a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime()
  );

  // Build chart data
  const chartData: { idx: number; plan: number; actual: number | null }[] = [];
  chartData.push({ idx: 0, plan: 0, actual: 0 });

  sorted.forEach((d, i) => {
    const plan = Math.round((d.plannedPct ?? 0) * 1000) / 10;
    const actual =
      d.actualPct !== null && d.actualPct !== undefined
        ? Math.round(d.actualPct * 1000) / 10
        : null;
    chartData.push({ idx: i + 1, plan, actual });
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
      >
        <XAxis dataKey="idx" hide />
        <YAxis hide domain={[0, 100]} />
        <Line
          type="monotone"
          dataKey="plan"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
