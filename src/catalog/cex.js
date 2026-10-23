/**
 * Minimal reader for delimited text in the CEX style: one header line, then
 * data lines. Blank lines, `//` comments and `#!block` labels are skipped.
 * Ported from imageviewer's src/lib/cex.ts so both apps read catalogs the same way.
 *
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {{ headers: string[], rows: Record<string, string>[], errors: string[] }}
 *   errors are human-readable (1-based line numbers) and never fatal
 */
export function parseDelimited(text, delimiter = '|') {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let headers = null;
  const rows = [];
  const errors = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('#!')) return;
    const cells = raw.split(delimiter).map((c) => c.trim());
    if (!headers) {
      // "Track Title" and "track_title" both become "track_title".
      headers = cells.map((h) => h.toLowerCase().replace(/\s+/g, '_'));
      return;
    }
    if (cells.length !== headers.length) {
      errors.push(`line ${i + 1}: expected ${headers.length} fields, found ${cells.length}`);
    }
    const row = {};
    headers.forEach((h, j) => (row[h] = cells[j] ?? ''));
    rows.push(row);
  });

  return { headers: headers ?? [], rows, errors };
}
