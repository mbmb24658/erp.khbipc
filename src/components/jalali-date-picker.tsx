"use client";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Jalali (Persian Solar) date picker component
// Converts between Gregorian (stored in DB) and Jalali (displayed to user)

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

const PERSIAN_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

// Gregorian → Jalali conversion (algorithm by Kazimierz M. Borkowski)
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

// Jalali → Gregorian conversion
function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  let gm = 0;
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return [gy, gm, gd];
}

// Convert digits to Persian
function toPersianDigits(s: string | number): string {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
}

// Convert Persian digits to English
function toEnglishDigits(s: string): string {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return s
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

// Format Gregorian Date to Jalali string "YYYY/MM/DD"
export function formatJalali(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, "0"))}/${toPersianDigits(String(jd).padStart(2, "0"))}`;
}

// Parse Jalali string "YYYY/MM/DD" to Gregorian Date
function parseJalali(s: string): Date | null {
  const cleaned = toEnglishDigits(s).replace(/[۰-۹]/g, "").trim();
  const parts = cleaned.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);
  if (!jy || !jm || !jd) return null;
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  const d = new Date(gy, gm - 1, gd);
  return isNaN(d.getTime()) ? null : d;
}

interface JalaliDatePickerProps {
  value?: string; // ISO date string from DB
  onChange: (isoDate: string | null) => void;
  placeholder?: string;
  className?: string;
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "YYYY/MM/DD (هجری شمسی)",
  className,
}: JalaliDatePickerProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value) : undefined
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setInputValue(formatJalali(d));
      }
    } else {
      setSelectedDate(undefined);
      setInputValue("");
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    const parsed = parseJalali(v);
    if (parsed) {
      setSelectedDate(parsed);
      onChange(parsed.toISOString());
    } else if (v.trim() === "") {
      setSelectedDate(undefined);
      onChange(null);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setInputValue(formatJalali(date));
      onChange(date.toISOString());
    } else {
      setSelectedDate(undefined);
      setInputValue("");
      onChange(null);
    }
    setOpen(false);
  };

  return (
    <div className="flex gap-1">
      <Input
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={cn("font-num", className)}
        dir="ltr"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            title="انتخاب از تقویم"
          >
            <CalendarIcon className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            initialFocus
            dir="rtl"
          />
          <div className="p-2 border-t text-xs text-center text-muted-foreground">
            {selectedDate ? formatJalali(selectedDate) : "تاریخ را انتخاب کنید"}
          </div>
        </PopoverContent>
      </Popover>
      {inputValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => {
            setInputValue("");
            setSelectedDate(undefined);
            onChange(null);
          }}
          title="پاک کردن"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
