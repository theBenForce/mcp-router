import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a timestamp (e.g. SQLite UTC "YYYY-MM-DD HH:MM:SS" or ISO string)
 * into a localized string in the user's local timezone.
 */
export function formatLocalDateTime(
  dateInput: string | Date | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return "—";
  let date: Date;
  if (typeof dateInput === "string") {
    let str = dateInput.trim();
    // SQLite datetime('now') outputs "YYYY-MM-DD HH:MM:SS" without 'T' or 'Z'.
    // Standard JS Date parsing treats Date-Time strings without timezone specifiers as local time,
    // which causes UTC SQLite timestamps to be incorrectly interpreted as local time.
    // Convert space to 'T' and append 'Z' if no timezone offset is present.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
      str = str.replace(" ", "T") + "Z";
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
      str = str + "Z";
    }
    date = new Date(str);
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    return String(dateInput);
  }

  return date.toLocaleString(undefined, options);
}

