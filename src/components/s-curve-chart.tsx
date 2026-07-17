"use client";
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis } from "recharts";

interface MonthlyProgress {
  monthDate: string;
  plannedPct: number;
  actualPct: number | null;
}

interface SCurveChartProps {
  data: MonthlyProgress[];
  // Optional: the overall actual progress (0-1) of the root WBS.
  // If provided, the actual curve will be computed by distributing this value
  // linearly from 0 across all months up to today.
  overallActual?: number;
}

// S-curve chart showing plan vs actual progress, no labels/title/legend
// per user request — just the curves.
//
// Improvements:
// - Actual line starts from (0, 0)
// - Both lines stop at today's date (no future data points)
// - At today's date, the actual percentage is displayed as a marker
export function SCurveChart({ data, overallActual }: SCurveChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        داده‌ای موجود نیست
      </div>
    );
  }

  // Convert to display format - sort by date
  const sorted = [...data].sort(
    (a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime()
  );

  // Determine "today" to know how far the actual curve should extend
  const now = new Date();

  // Build chart data:
  // - Always start with point at index 0 = (0, 0) for both plan and actual
  // - For each month up to today:
  //   - plan: cumulative plannedPct
  //   - actual: if explicit actualPct, use it; otherwise interpolate from 0 to overallActual
  const chartData: { idx: number; plan: number; actual: number | null }[] = [];

  // Start point at (0, 0)
  chartData.push({ idx: 0, plan: 0, actual: 0 });

  const firstDate = new Date(sorted[0].monthDate);
  const lastDate = new Date(sorted[sorted.length - 1].monthDate);
  const totalSpan = lastDate.getTime() - firstDate.getTime();

  sorted.forEach((d, i) => {
    const monthDate = new Date(d.monthDate);
    const plan = Math.round((d.plannedPct ?? 0) * 1000) / 10; // 0-100 with 1 decimal

    // Compute actual: if we have explicit actualPct use it, otherwise interpolate
    let actual: number | null = null;
    if (d.actualPct !== null && d.actualPct !== undefined) {
      actual = Math.round(d.actualPct * 1000) / 10;
    } else if (overallActual !== undefined && overallActual !== null) {
      // Interpolate: distribute overallActual linearly from 0 across all months to today
      const elapsed = monthDate.getTime() - firstDate.getTime();

      if (monthDate <= now) {
        if (totalSpan <= 0) {
          actual = Math.round(overallActual * 1000) / 10;
        } else {
          // Linear interpolation from 0 to overallActual
          const fraction = Math.min(1, Math.max(0, elapsed / totalSpan));
          actual = Math.round(overallActual * fraction * 1000) / 10;
        }
      } else {
        // Future month - actual is null (hasn't happened yet)
        actual = null;
      }
    }

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
