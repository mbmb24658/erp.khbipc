import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowRight, Flame, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

// Heat map computation helper (negative impact)
const impactMap: Record<string, number> = { اساسی: 5, عمده: 4, متوسط: 3, جزئی: 2, ناچیز: 1 };
const probMap: Record<string, number> = { نادر: 1, بعید: 2, ممکن: 3, محتمل: 4, مکرر: 5 };
const heatMap: Record<number, Record<number, string>> = {
  5: { 1: "Medium", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  4: { 1: "Low", 2: "Medium", 3: "High", 4: "Critical", 5: "Critical" },
  3: { 1: "Low", 2: "Medium", 3: "Medium", 4: "High", 5: "High" },
  2: { 1: "Low", 2: "Medium", 3: "Medium", 4: "Medium", 5: "Medium" },
  1: { 1: "Low", 2: "Low", 3: "Low", 4: "Low", 5: "Medium" },
};

const levelColor: Record<string, string> = {
  Low: "bg-emerald-500",
  Medium: "bg-amber-500",
  High: "bg-orange-500",
  Critical: "bg-red-500",
};

const levelLabel: Record<string, string> = {
  Low: "پایین",
  Medium: "متوسط",
  High: "زیاد",
  Critical: "بحرانی",
};

const impacts = ["اساسی", "عمده", "متوسط", "جزئی", "ناچیز"]; // top to bottom (high to low)
const probsOrder = ["نادر", "بعید", "ممکن", "محتمل", "مکرر"];

function shortCode(code: string): string {
  // e.g. "KH-RISK-1" -> "KR1"
  const parts = code.split(/[-_]/);
  if (parts.length >= 2) {
    const head = parts
      .map((p) => p.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const tail = parts[parts.length - 1];
    return `${head}${tail}`;
  }
  return code.slice(0, 4);
}

interface CellData {
  count: number;
  risks: { id: string; code: string }[];
}

function buildMatrix(risks: any[], evaluationKey: "levelCurrent" | "levelTarget") {
  // 5x5 matrix
  // We'll build using impact/probability values from each risk's latest evaluation
  // Cell row = impact index (0=high اساسی, 4=low ناچیز) - we'll reverse for display
  // Cell col = probability index (0=low نادر, 4=high مکرر)
  const matrix: CellData[][] = [];
  for (let i = 0; i < 5; i++) {
    matrix.push([]);
    for (let j = 0; j < 5; j++) matrix[i].push({ count: 0, risks: [] });
  }
  for (const r of risks) {
    const ev = r.evaluations && r.evaluations[0];
    if (!ev) continue;
    const impact = evaluationKey === "levelCurrent" ? ev.impactCurrent : ev.impactTarget;
    const prob = evaluationKey === "levelCurrent" ? ev.probabilityCurrent : ev.probabilityTarget;
    if (!impact || !prob) continue;
    const iIdx = impactMap[impact];
    const pIdx = probMap[prob];
    if (!iIdx || !pIdx) continue;
    // convert to 0-based row index (impact 5 -> row 0, impact 1 -> row 4)
    const row = 5 - iIdx;
    const col = pIdx - 1;
    matrix[row][col].count++;
    matrix[row][col].risks.push({ id: r.id, code: r.code });
  }
  return matrix;
}

export default async function RiskHeatmapPage() {
  const [risks, evaluations] = await Promise.all([
    db.risk.findMany(),
    db.riskEvaluation.findMany({
      orderBy: [{ evaluatedAt: "desc" }],
    }),
  ]);

  // Build a map of riskId -> latest evaluation
  const latestEvalByRisk = new Map<string, any>();
  for (const ev of evaluations) {
    if (!latestEvalByRisk.has(ev.riskId)) {
      latestEvalByRisk.set(ev.riskId, ev);
    }
  }

  // Serialize and attach latest evaluation to each risk
  const serialized = risks.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    evaluations: latestEvalByRisk.has(r.id) ? [latestEvalByRisk.get(r.id)] : [],
  }));

  const currentMatrix = buildMatrix(serialized, "levelCurrent");
  const targetMatrix = buildMatrix(serialized, "levelTarget");

  // Stats by level (using current)
  const levelCounts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  for (const r of serialized) {
    const ev = r.evaluations && r.evaluations[0];
    if (!ev) continue;
    const lvl = ev.levelCurrent;
    if (lvl && levelCounts[lvl] !== undefined) levelCounts[lvl]++;
  }
  const totalEvaluated = Object.values(levelCounts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/risks" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />
          بازگشت به مدیریت ریسک
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">نقشه حرارتی ریسک</h1>
          <p className="text-sm text-muted-foreground mt-1">
            نمایش توزیع ریسک‌ها بر اساس احتمال و اثر، با استفاده از ماتریس 5×5
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{totalEvaluated.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">کل ارزیابی شده</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{levelCounts.Low.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سطح پایین</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{levelCounts.Medium.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سطح متوسط</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{levelCounts.High.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سطح زیاد</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xl font-bold">{levelCounts.Critical.toLocaleString("fa-IR")}</p>
              <p className="text-xs text-muted-foreground">سطح بحرانی</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HeatmapMatrix title="سطح فعلی ریسک" matrix={currentMatrix} />
        <HeatmapMatrix title="سطح هدف ریسک" matrix={targetMatrix} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">راهنما</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-emerald-500" />
              <span>سطح پایین (Low)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-amber-500" />
              <span>سطح متوسط (Medium)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-orange-500" />
              <span>سطح زیاد (High)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-red-500" />
              <span>سطح بحرانی (Critical)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeatmapMatrix({ title, matrix }: { title: string; matrix: CellData[][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header row: probability labels */}
            <div className="flex items-end">
              <div className="w-20 shrink-0" />
              <div className="flex-1 grid grid-cols-5 gap-1">
                {probsOrder.map((p) => (
                  <div key={p} className="text-center text-xs font-medium pb-1">{p}</div>
                ))}
              </div>
            </div>
            {/* Rows */}
            {impacts.map((imp, rowIdx) => (
              <div key={imp} className="flex items-stretch">
                <div className="w-20 shrink-0 flex items-center justify-end pr-2 text-xs font-medium">
                  {imp}
                </div>
                <div className="flex-1 grid grid-cols-5 gap-1">
                  {probsOrder.map((_, colIdx) => {
                    const cell = matrix[rowIdx][colIdx];
                    const iIdx = 5 - rowIdx;
                    const pIdx = colIdx + 1;
                    const lvl = heatMap[iIdx][pIdx];
                    const color = levelColor[lvl] || "bg-muted";
                    return (
                      <div
                        key={colIdx}
                        className={`${color} rounded-md p-2 min-h-20 flex flex-col items-center justify-center text-white`}
                        title={`${levelLabel[lvl]} (${cell.count.toLocaleString("fa-IR")} ریسک)`}
                      >
                        <span className="text-lg font-bold leading-none">
                          {cell.count > 0 ? cell.count.toLocaleString("fa-IR") : ""}
                        </span>
                        {cell.risks.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 justify-center max-w-full overflow-hidden">
                            {cell.risks.slice(0, 4).map((r) => (
                              <Link
                                key={r.id}
                                href="/risks"
                                className="text-[10px] bg-white/25 px-1 rounded font-mono"
                                title={r.code}
                              >
                                {shortCode(r.code)}
                              </Link>
                            ))}
                            {cell.risks.length > 4 && (
                              <span className="text-[10px]">+{(cell.risks.length - 4).toLocaleString("fa-IR")}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* X axis label */}
            <div className="flex items-end mt-2">
              <div className="w-20 shrink-0" />
              <div className="flex-1 text-center text-xs text-muted-foreground">
                احتمال وقوع (از کم به زیاد →)
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
