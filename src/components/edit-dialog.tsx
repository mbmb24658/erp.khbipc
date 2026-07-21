"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { ReactNode, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export interface FormField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "password" | "multiselect";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  readOnly?: boolean;
  min?: number;
  max?: number;
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
        if (f.type === "multiselect") {
          // Array of selected IDs (or null if empty)
          cleaned[f.key] = Array.isArray(v) && v.length > 0 ? v : null;
        } else if (v === "" || v === undefined || v === null) {
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
                ) : f.type === "multiselect" ? (
                  <MultiSelectField
                    options={f.options || []}
                    selectedValues={Array.isArray(data[f.key]) ? data[f.key] : []}
                    onChange={(vals) => setData({ ...data, [f.key]: vals })}
                    placeholder={f.placeholder || "انتخاب کنید"}
                  />
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
                    readOnly={f.readOnly}
                    min={f.type === "number" ? f.min : undefined}
                    max={f.type === "number" ? f.max : undefined}
                    className={f.readOnly ? "bg-muted/50 text-muted-foreground cursor-not-allowed" : undefined}
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

// Multi-select field component with checkboxes
function MultiSelectField({
  options,
  selectedValues,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const selectedLabels = options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => o.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-right font-normal h-auto min-h-[40px] py-2"
        >
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1 w-full">
              {selectedLabels.map((label, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded px-1.5 py-0.5"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder || "انتخاب کنید"}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] max-h-[300px] overflow-y-auto p-2" align="start">
        <div className="space-y-1">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              موردی موجود نیست
            </p>
          ) : (
            options.map((o) => {
              const checked = selectedValues.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="flex-1">{o.label}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
