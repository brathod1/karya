import { format as fnsFormat, differenceInCalendarDays, isValid, parseISO } from "date-fns";

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

export function formatDate(value: Date | string | null | undefined, pattern = "dd MMM yyyy"): string {
  const d = toDate(value);
  return d ? fnsFormat(d, pattern) : "—";
}

export function formatDateTime(value: Date | string | null | undefined, pattern = "dd MMM yyyy, HH:mm"): string {
  const d = toDate(value);
  return d ? fnsFormat(d, pattern) : "—";
}

/** yyyy-MM-dd for <input type="date"> */
export function toInputDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? fnsFormat(d, "yyyy-MM-dd") : "";
}

export function formatNumber(value: number, locale = "en-IN", maxFractionDigits = 3): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatQuantity(value: number, locale = "en-IN"): string {
  return formatNumber(value, locale, 3);
}

export type DeliveryState = "none" | "overdue" | "today" | "soon" | "upcoming" | "done";

export function deliveryState(
  deliveryBy: Date | string | null | undefined,
  isCompleted: boolean,
  dueSoonDays = 2,
  now: Date = new Date(),
): { state: DeliveryState; days: number | null } {
  if (isCompleted) return { state: "done", days: null };
  const d = toDate(deliveryBy);
  if (!d) return { state: "none", days: null };
  const days = differenceInCalendarDays(d, now);
  if (days < 0) return { state: "overdue", days };
  if (days === 0) return { state: "today", days };
  if (days <= dueSoonDays) return { state: "soon", days };
  return { state: "upcoming", days };
}

export function relativeDeliveryLabel(state: DeliveryState, days: number | null, dateLabel: string): string {
  switch (state) {
    case "done": return "Delivered";
    case "overdue": return days === -1 ? "Overdue by 1 day" : `Overdue by ${Math.abs(days ?? 0)} days`;
    case "today": return "Due today";
    case "soon": return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
    case "upcoming": return `Due ${dateLabel}`;
    default: return "No date";
  }
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workspace";
}

export function keyify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}
