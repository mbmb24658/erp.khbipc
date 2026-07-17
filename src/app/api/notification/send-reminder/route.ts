import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST: Send a reminder notification to the responsible person of an activity
// Spam handling: only 1 notification per activity per user per day
//
// Body: {
//   activityId: string,      // The activity to remind about
//   message?: string,        // Custom message (optional, default: "لطفا این فعالیت را پیگیری کنید")
//   userId?: string,         // Target user (optional, defaults to responsible person's user account)
// }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const { activityId, message, userId } = data;

  if (!activityId) {
    return NextResponse.json({ error: "شناسه فعالیت الزامی است" }, { status: 400 });
  }

  // Fetch the activity with its responsible person
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      personAssignments: {
        include: {
          personel: {
            include: {
              user: true,
            },
          },
        },
      },
      asset: true,
    },
  });

  if (!activity) {
    return NextResponse.json({ error: "فعالیت یافت نشد" }, { status: 404 });
  }

  // Find the responsible person (role = "مسئول" or first assigned person)
  const responsible = activity.personAssignments.find((p) => p.role === "مسئول") ||
    activity.personAssignments[0];

  if (!responsible) {
    return NextResponse.json({ error: "هیچ مسئولی برای این فعالیت تعیین نشده است" }, { status: 400 });
  }

  // Find the target user — either explicitly provided or the user linked to the responsible person
  let targetUserId = userId;
  if (!targetUserId) {
    targetUserId = responsible.personel.user?.id || null;
  }

  if (!targetUserId) {
    return NextResponse.json({
      error: `کاربر ${responsible.personel.name} حساب کاربری ندارد و نمی‌تواند اعلان دریافت کند`,
    }, { status: 400 });
  }

  // === SPAM HANDLING ===
  // Check if a notification for this activity was already sent today to this user
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const existingNotification = await db.notification.findFirst({
    where: {
      userId: targetUserId,
      actionUrl: `/activities/${activityId}`,
      createdAt: {
        gte: startOfToday,
        lt: endOfToday,
      },
    },
  });

  if (existingNotification) {
    return NextResponse.json({
      success: false,
      message: "امروز قبلاً برای این فعالیت اعلان ارسال شده است",
      notification: existingNotification,
    });
  }

  // === BUILD NOTIFICATION MESSAGE ===
  // Default message or custom message
  // If activity end date is near, add urgency
  let finalMessage = message || "لطفا این فعالیت را پیگیری کنید";

  if (!message && activity.endDate) {
    const now = new Date();
    const endDate = new Date(activity.endDate);
    const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilEnd < 0) {
      finalMessage = `فعالیت «${activity.title}» ${Math.abs(daysUntilEnd).toLocaleString("fa-IR")} روز از موعد پایان آن گذشته است. لطفاً فوراً پیگیری کنید.`;
    } else if (daysUntilEnd === 0) {
      finalMessage = `فعالیت «${activity.title}» امروز باید تکمیل شود. لطفاً پیگیری کنید.`;
    } else if (daysUntilEnd <= 3) {
      finalMessage = `فعالیت «${activity.title}» تنها ${daysUntilEnd.toLocaleString("fa-IR")} روز تا پایان زمان باقی دارد. لطفاً پیگیری کنید.`;
    } else {
      finalMessage = `لطفاً فعالیت «${activity.title}» را پیگیری کنید. زمان پایان: ${daysUntilEnd.toLocaleString("fa-IR")} روز دیگر.`;
    }
  }

  // Determine priority based on urgency
  let priority = "normal";
  if (activity.endDate) {
    const now = new Date();
    const endDate = new Date(activity.endDate);
    const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilEnd < 0) priority = "urgent";
    else if (daysUntilEnd <= 3) priority = "high";
  }

  // === CREATE NOTIFICATION ===
  const notification = await db.notification.create({
    data: {
      userId: targetUserId,
      title: `پیگیری فعالیت: ${activity.title}`,
      message: finalMessage,
      category: "activity",
      priority,
      actionUrl: `/activities/${activityId}`,
    },
  });

  // Log the action
  await db.userLog.create({
    data: {
      userId: (session.user as any).id,
      action: "notification.send_reminder",
      description: `ارسال اعلان پیگیری برای فعالیت ${activity.code} به ${responsible.personel.name}`,
    },
  });

  return NextResponse.json({
    success: true,
    message: "اعلان پیگیری ارسال شد",
    notification,
    recipient: responsible.personel.name,
  });
}
