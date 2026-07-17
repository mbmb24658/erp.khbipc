import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await db.kPIEvaluation.findUnique({
    where: { id },
    include: {
      template: { include: { categories: { include: { indicators: true } } } },
      personel: true,
      orgChart: true,
      evaluatedBy: true,
      records: { include: { indicator: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await req.json();
  const existing = await db.kPIEvaluation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  try {
    // Update evaluation meta
    await db.kPIEvaluation.update({
      where: { id },
      data: {
        status: data.status ?? existing.status,
        notes: data.notes === undefined ? existing.notes : data.notes || null,
      },
    });

    // Update records if provided
    if (Array.isArray(data.records)) {
      let totalScore = 0;
      let maxScore = 0;
      for (const r of data.records) {
        const value = Number(r.value || 0);
        const target = r.targetValue ? Number(r.targetValue) : null;
        const weight = r.weight ? Number(r.weight) : 1;
        let score: number | null = null;
        if (target && target > 0) {
          score = Math.min(100, (value / target) * 100);
        }
        if (score != null) {
          totalScore += score * weight;
          maxScore += 100 * weight;
        }
        if (r.id) {
          await db.kPIEvaluationRecord.update({
            where: { id: r.id },
            data: {
              value,
              targetValue: target,
              score,
              weight,
              notes: r.notes === undefined ? undefined : r.notes || null,
            },
          });
        }
      }
      const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : null;
      await db.kPIEvaluation.update({
        where: { id },
        data: {
          totalScore: totalScore > 0 ? totalScore : null,
          maxScore: maxScore > 0 ? maxScore : null,
          percentageScore: percentage,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role === "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await db.kPIEvaluation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
