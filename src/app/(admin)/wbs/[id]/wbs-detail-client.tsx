"use client";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { EditDialog } from "@/components/edit-dialog";
import { useRouter } from "next/navigation";
import { notifySuccess, notifyError } from "@/lib/notify";

interface WBSDetailClientProps {
  wbs: any;
}

export function WBSDetailClient({ wbs }: WBSDetailClientProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  const fields = [
    { key: "wbsCode", label: "کد WBS", required: true },
    { key: "title", label: "عنوان فعالیت", required: true },
    { key: "durationDays", label: "مدت (روز)", type: "number" as const },
    {
      key: "progressPlan",
      label: "پیشرفت برنامه (%)",
      type: "number" as const,
      helpText: "0 تا 100",
    },
    {
      key: "progressActual",
      label: "پیشرفت واقعی (%)",
      type: "number" as const,
      helpText: "0 تا 100",
    },
    { key: "startDate", label: "تاریخ شروع", type: "date" as const },
    { key: "finishDate", label: "تاریخ پایان", type: "date" as const },
    { key: "hrPlan", label: "منابع انسانی برنامه", type: "textarea" as const },
    { key: "hrActual", label: "منابع انسانی واقعی", type: "textarea" as const },
    { key: "actualCost", label: "هزینه واقعی", type: "number" as const },
    { key: "costVariance", label: "انحراف هزینه", type: "number" as const },
    { key: "scheduleVariance", label: "انحراف زمانی", type: "number" as const },
    { key: "description", label: "توضیحات", type: "textarea" as const },
  ];

  const handleSave = async (data: Record<string, any>) => {
    // Convert percent (0-100) to decimal (0-1)
    if (data.progressPlan !== null) data.progressPlan = data.progressPlan / 100;
    if (data.progressActual !== null) data.progressActual = data.progressActual / 100;

    const res = await fetch(`/api/wbs/${wbs.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "خطا در ذخیره‌سازی");
    }
    notifySuccess("فعالیت ویرایش شد");
    router.refresh();
  };

  const initialData = {
    ...wbs,
    progressPlan: Math.round(wbs.progressPlan * 100),
    progressActual: Math.round(wbs.progressActual * 100),
    startDate: wbs.startDate ? wbs.startDate.split("T")[0] : "",
    finishDate: wbs.finishDate ? wbs.finishDate.split("T")[0] : "",
  };

  return (
    <div className="flex justify-end mb-2">
      <Button onClick={() => setEditOpen(true)} size="sm">
        <Pencil className="w-4 h-4 ml-1" />
        ویرایش فعالیت
      </Button>
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`ویرایش: ${wbs.wbsCode}`}
        fields={fields}
        initialData={initialData}
        onSubmit={handleSave}
      />
    </div>
  );
}
