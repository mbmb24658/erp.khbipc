// ============================================================
// actual-progress-distribution.ts
//
// Helper: distribute the current actual progress across the
// time axis (monthly intervals) so we can draw a realistic
// "actual progress" S-curve even when only the current overall
// percentage is known.
//
// Algorithm (per user spec):
//   - Today is the "anchor" point: (today, currentProgress)
//   - Walk backwards in monthly intervals from today to the
//     first month of the planned S-curve.
//   - At each past month, the actual progress = currentProgress
//     multiplied by (days elapsed from that month to start) /
//     (days from today to start). This produces a monotonically
//     increasing curve from 0 → currentProgress.
//   - Months after today get null (future, not yet achieved).
//
// This is applied to:
//   - Dashboard root S-curve
//   - Strategic topic S-curves (1.1 - 1.5)
//   - WBS detail page S-curve
//   - Reports S-curves
// ============================================================

export interface MonthlyPoint {
  monthDate: string; // ISO string
  plannedPct: number; // 0-1
  actualPct: number | null; // 0-1
}

/**
 * Given:
 *   - planned S-curve points (with monthDate + plannedPct)
 *   - currentOverallActual (0-1) — e.g., rootWbs.progressActual
 *
 * Returns a NEW array where actualPct is computed by distributing
 * currentOverallActual across the time axis from the first month
 * to today.
 *
 * Algorithm (per user spec):
 *   - Today is the "anchor" point: (today, currentOverallActual)
 *   - Walk backwards in monthly intervals from today to the first month.
 *   - At each past month, the actual progress = currentOverallActual
 *     multiplied by (days elapsed from that month to start) /
 *     (days from today to start). This produces a monotonically
 *     increasing curve from 0 → currentOverallActual.
 *   - Months after today get null (future, not yet achieved).
 *
 * NOTE: This ALWAYS overwrites actualPct with the distributed value.
 * The currentOverallActual (read from WBS.progressActual) is the
 * source of truth — it's the value shown on the "پیشرفت واقعی" card
 * on each WBS detail page.
 */
export function distributeActualProgress(
  planned: MonthlyPoint[],
  currentOverallActual: number
): MonthlyPoint[] {
  if (!planned || planned.length === 0) return [];

  // Sort by monthDate ascending
  const sorted = [...planned].sort(
    (a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime()
  );

  const now = new Date();
  const firstDate = new Date(sorted[0].monthDate);
  const lastDate = new Date(sorted[sorted.length - 1].monthDate);

  // Anchor: today, but clamped to [firstDate, lastDate]
  const anchorDate = now > lastDate ? lastDate : now < firstDate ? firstDate : now;
  // Time elapsed from first planned month to anchor (today or clamped)
  const anchorElapsed = anchorDate.getTime() - firstDate.getTime();

  return sorted.map((p) => {
    const monthDate = new Date(p.monthDate);

    // Future month: actual is null (not yet achieved)
    if (monthDate > now) {
      return { ...p, actualPct: null };
    }

    // Compute the fraction of time elapsed from firstDate to this month,
    // relative to the anchor (today).
    const elapsed = monthDate.getTime() - firstDate.getTime();
    let fraction: number;
    if (anchorElapsed <= 0) {
      // Anchor is at or before firstDate — only this point gets the full value
      fraction = monthDate.getTime() >= anchorDate.getTime() ? 1 : 0;
    } else {
      // Linear: 0 at firstDate, 1 at anchorDate
      fraction = Math.min(1, Math.max(0, elapsed / anchorElapsed));
    }

    // Scale currentOverallActual by the fraction
    const actualPct = currentOverallActual * fraction;

    // Round to 4 decimal places to avoid floating-point noise
    const rounded = Math.round(actualPct * 10000) / 10000;

    return { ...p, actualPct: rounded };
  });
}

/**
 * Convenience: build a synthetic monthly time axis from startDate
 * to endDate (or today, whichever is earlier), then distribute
 * currentOverallActual across it. Used when no planned S-curve
 * exists but we still want to show an actual curve.
 */
export function buildSyntheticActualCurve(
  startDate: Date | string | null,
  endDate: Date | string | null,
  currentOverallActual: number
): MonthlyPoint[] {
  if (!startDate || !endDate) return [];
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (start >= end) return [];

  const now = new Date();
  const effectiveEnd = end < now ? end : now;
  if (start >= effectiveEnd) return [];

  // Generate monthly points from start to effectiveEnd
  const points: MonthlyPoint[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1);

  while (current <= lastMonth) {
    // Use mid-month date to avoid edge cases
    const midMonth = new Date(current.getFullYear(), current.getMonth(), 15);
    // Planned: linear from 0 to 1 across the full span (just for reference)
    const totalSpan = end.getTime() - start.getTime();
    const elapsed = midMonth.getTime() - start.getTime();
    const plannedPct = totalSpan > 0 ? Math.min(1, Math.max(0, elapsed / totalSpan)) : 0;

    points.push({
      monthDate: midMonth.toISOString(),
      plannedPct: Math.round(plannedPct * 10000) / 10000,
      actualPct: null,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return distributeActualProgress(points, currentOverallActual);
}

/**
 * Get today's Jalali (Persian Solar) date as a formatted long string.
 * Used for the date display at the top of every page.
 */
export function getTodayJalaliLong(): string {
  // Use the existing formatJalaliLong function from lib/jalali
  // We import it lazily to avoid circular dependencies.
  // This function is just a convenience wrapper.
  const now = new Date();
  // Inline the conversion to avoid import issues during SSR
  const PERSIAN_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];

  function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy: number;
    if (gy > 1600) {
      jy = 979;
      gy -= 1600;
    } else {
      jy = 0;
      gy -= 621;
    }
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days =
      365 * gy +
      Math.floor((gy2 + 3) / 4) -
      Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) -
      80 +
      gd +
      g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }

  function toPersianDigits(s: string | number): string {
    const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(s).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
  }

  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const weekday = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"][now.getDay()];
  return `${weekday} ${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}
