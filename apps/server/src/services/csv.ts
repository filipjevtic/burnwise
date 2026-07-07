/**
 * Minimal, dependency-free CSV serialization (RFC 4180). Values containing
 * commas, quotes, or newlines are quoted, and embedded quotes are doubled.
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Formula-injection guard: spreadsheet apps execute cells beginning with
  // = + - @ (or tab/CR). Export data includes user-controlled ticket titles,
  // emails, and branch/prompt text, so neutralize by prefixing a single quote.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize rows to a CSV string with a header line. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(c.value(row))).join(","));
  return [header, ...lines].join("\r\n");
}
