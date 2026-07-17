"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { ReactNode, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export interface FormField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "password";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormField[];
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  submitLabel?: string;
}

export function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initialData,
  onSubmit,
  submitLabel = "ذخیره",
}: EditDialogProps) {
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setData(initialData || {});
      setError("");
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Clean data - convert empty strings to null, numbers to numbers
      const cleaned: Record<string, any> = {};
      for (const f of fields) {
        const v = data[f.key];
        if (v === "" || v === undefined || v === null) {
          cleaned[f.key] = null;
        } else if (f.type === "number") {
          cleaned[f.key] = Number(v);
        } else if (f.type === "date") {
          // v could be an ISO string from JalaliDatePicker or a date string from DB
          const d = v instanceof Date ? v : new Date(v);
          cleaned[f.key] = isNaN(d.getTime()) ? null : d;
        } else {
          cleaned[f.key] = v;
        }
      }
      await onSubmit(cleaned);
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message || "خطا در ذخیره‌سازی");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label htmlFor={f.key}>
                  {f.label}
                  {f.required && <span className="text-destructive mr-1">*</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.key}
                    value={data[f.key] ?? ""}
                    onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={3}
                  />
                ) : f.type === "select" ? (
                  <Select
                    value={data[f.key] ?? ""}
                    onValueChange={(v) => setData({ ...data, [f.key]: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={f.placeholder || "انتخاب کنید"} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o, idx) => (
                        <SelectItem key={`${o.value}-${idx}`} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "date" ? (
                  <JalaliDatePicker
                    value={data[f.key] ?? ""}
                    onChange={(v) => setData({ ...data, [f.key]: v })}
                    placeholder={f.placeholder || "YYYY/MM/DD"}
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                    value={data[f.key] ?? ""}
                    onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    step={f.type === "number" ? "any" : undefined}
                  />
                )}
                {f.helpText && (
                  <p className="text-xs text-muted-foreground">{f.helpText}</p>
                )}
              </div>
            ))}
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              انصراف
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Confirmation dialog for delete
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">{message}</p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            انصراف
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
            تایید و حذف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
