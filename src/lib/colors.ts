/**
 * Status colours are stored as TOKEN NAMES, never hex, so that user-configured
 * statuses always stay inside the design palette (and dark mode is one mapping).
 */
export const STATUS_COLORS = [
  "neutral", "slate", "amber", "orange", "emerald", "teal", "sky", "blue", "violet", "rose", "red",
] as const;

export type StatusColor = (typeof STATUS_COLORS)[number];

const MAP: Record<string, { chip: string; dot: string; soft: string }> = {
  neutral: { chip: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400", soft: "bg-stone-50" },
  slate:   { chip: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400", soft: "bg-slate-50" },
  amber:   { chip: "bg-amber-100 text-amber-800 ring-amber-200", dot: "bg-amber-500", soft: "bg-amber-50" },
  orange:  { chip: "bg-orange-100 text-orange-800 ring-orange-200", dot: "bg-orange-500", soft: "bg-orange-50" },
  emerald: { chip: "bg-emerald-100 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", soft: "bg-emerald-50" },
  teal:    { chip: "bg-teal-100 text-teal-800 ring-teal-200", dot: "bg-teal-500", soft: "bg-teal-50" },
  sky:     { chip: "bg-sky-100 text-sky-800 ring-sky-200", dot: "bg-sky-500", soft: "bg-sky-50" },
  blue:    { chip: "bg-blue-100 text-blue-800 ring-blue-200", dot: "bg-blue-500", soft: "bg-blue-50" },
  violet:  { chip: "bg-violet-100 text-violet-800 ring-violet-200", dot: "bg-violet-500", soft: "bg-violet-50" },
  rose:    { chip: "bg-rose-100 text-rose-800 ring-rose-200", dot: "bg-rose-500", soft: "bg-rose-50" },
  red:     { chip: "bg-red-100 text-red-800 ring-red-200", dot: "bg-red-500", soft: "bg-red-50" },
};

export function statusColorClasses(color: string) {
  return MAP[color] ?? MAP.neutral;
}

/** Deterministic palette for charts, so the same category keeps the same colour. */
export const CHART_COLORS = [
  "#0F766E", "#D97706", "#2563EB", "#DC2626", "#7C3AED",
  "#059669", "#DB2777", "#0891B2", "#CA8A04", "#4F46E5",
];
export function chartColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}
