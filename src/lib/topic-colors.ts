// Color coding for the 5 strategic topics ("nude" palette).
// Used across the app to color topic headers, badges, dividers and charts.

export interface TopicColor {
  bg: string;
  text: string;
  border: string;
  chart: string;
}

export const strategicTopicColors: Record<string, TopicColor> = {
  "1.1": {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    chart: "#e11d48", // Nude rose
  },
  "1.2": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    chart: "#d97706", // Nude amber
  },
  "1.3": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    chart: "#059669", // Nude emerald
  },
  "1.4": {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    chart: "#7c3aed", // Nude violet
  },
  "1.5": {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    chart: "#0284c7", // Nude sky
  },
};

// Strategic topic labels (Persian)
export const strategicTopicLabels: Record<string, string> = {
  "1.1": "۱.۱ - حکمرانی دارایی‌محور",
  "1.2": "۱.۲ - دارایی‌های داخلی",
  "1.3": "۱.۳ - دارایی‌های بیرونی",
  "1.4": "۱.۴ - دارایی‌های دانشی",
  "1.5": "۱.۵ - پایداری مالی",
};

export const strategicTopicOrder = ["1.1", "1.2", "1.3", "1.4", "1.5"];

// Helper: get colors for a topic, with a fallback "neutral" object
export function getTopicColor(topic: string | null | undefined): TopicColor {
  if (topic && strategicTopicColors[topic]) {
    return strategicTopicColors[topic];
  }
  return {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    chart: "#94a3b8",
  };
}

// Helper: badge className for a topic (used in activity cards, issue rows, etc.)
export function topicBadgeClass(topic: string | null | undefined): string {
  const c = getTopicColor(topic);
  return `${c.bg} ${c.text} ${c.border}`;
}
