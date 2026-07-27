import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** tailwind-merge must be v3+; v2 silently mis-merges v4 class names. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "September 28" — how dates read in body copy. */
export function formatDate(iso: string, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** "September 28, 2026" — for legal and email contexts. */
export function formatDateLong(iso: string, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
