import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: aggregated financial summary for charts & P&L
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all cost breakdown records (only with programForecast > 0)
  const costs = await db.costBreakdown.findMany({
    where: {
      OR: [
        { programForecast: { gt: 0 } },
        { initialForecast: { gt: 0 } },
      ],
    },
  });

  // Group costs by category
  const costsByCategory: Record<string, { initial: number; program: number; count: number }> = {};
  for (const c of costs) {
    const cat = c.category || "سایر";
    if (!costsByCategory[cat]) costsByCategory[cat] = { initial: 0, program: 0, count: 0 };
    costsByCategory[cat].initial += c.initialForecast || 0;
    costsByCategory[cat].program += c.programForecast || 0;
    costsByCategory[cat].count++;
  }

  // Get all revenue breakdown records
  const revenues = await db.revenueBreakdown.findMany({
    where: {
      OR: [
        { programForecast: { gt: 0 } },
        { initialForecast: { gt: 0 } },
      ],
    },
    include: { asset: true },
  });

  // Group revenues by theme
  const revenuesByTheme: Record<string, { initial: number; program: number; count: number }> = {};
  for (const r of revenues) {
    const theme = r.theme || "سایر";
    if (!revenuesByTheme[theme]) revenuesByTheme[theme] = { initial: 0, program: 0, count: 0 };
    revenuesByTheme[theme].initial += r.initialForecast || 0;
    revenuesByTheme[theme].program += r.programForecast || 0;
    revenuesByTheme[theme].count++;
  }

  // Compute actual revenue per revenue row: ownershipShare × asset.actualValue
  const revenuesDetailed = revenues.map((r) => {
    const ownershipShare = r.ownershipShare ?? 0;
    const assetValue = r.asset?.actualValue ?? r.asset?.currentValue ?? r.asset?.initialValue ?? 0;
    const actualRevenue = ownershipShare * assetValue;
    return {
      id: r.id,
      revenueId: r.revenueId,
      description: r.description,
      title: r.title,
      theme: r.theme,
      ownershipShare,
      assetValue,
      actualRevenue,
      programForecast: r.programForecast,
      initialForecast: r.initialForecast,
    };
  });

  // Totals
  const totalCostInitial = costs.reduce((s, c) => s + (c.initialForecast || 0), 0);
  const totalCostProgram = costs.reduce((s, c) => s + (c.programForecast || 0), 0);
  const totalRevenueInitial = revenues.reduce((s, r) => s + (r.initialForecast || 0), 0);
  const totalRevenueProgram = revenues.reduce((s, r) => s + (r.programForecast || 0), 0);
  const totalActualRevenue = revenuesDetailed.reduce((s, r) => s + r.actualRevenue, 0);

  return NextResponse.json({
    costsByCategory: Object.entries(costsByCategory).map(([name, v]) => ({
      name,
      initial: v.initial,
      program: v.program,
      count: v.count,
      programPct: totalCostProgram > 0 ? (v.program / totalCostProgram) * 100 : 0,
    })),
    revenuesByTheme: Object.entries(revenuesByTheme).map(([name, v]) => ({
      name,
      initial: v.initial,
      program: v.program,
      count: v.count,
      programPct: totalRevenueProgram > 0 ? (v.program / totalRevenueProgram) * 100 : 0,
    })),
    revenuesDetailed,
    totals: {
      totalCostInitial,
      totalCostProgram,
      totalRevenueInitial,
      totalRevenueProgram,
      totalActualRevenue,
      profitInitial: totalRevenueInitial - totalCostInitial,
      profitProgram: totalRevenueProgram - totalCostProgram,
    },
  });
}
