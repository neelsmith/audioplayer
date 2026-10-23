import { describe, it, expect } from 'vitest';
import { parseDelimited } from '../../src/catalog/cex.js';

describe('parseDelimited', () => {
  it('reads a header and rows, normalising header names', () => {
    const t = parseDelimited('Path | Track Title\na.mp3|One\nb.mp3| Two ');
    expect(t.headers).toEqual(['path', 'track_title']);
    expect(t.rows).toEqual([{ path: 'a.mp3', track_title: 'One' }, { path: 'b.mp3', track_title: 'Two' }]);
    expect(t.errors).toEqual([]);
  });
  it('skips blank lines, // comments and #! labels, and a BOM', () => {
    const t = parseDelimited('﻿#!audio\n// note\n\npath|title\r\n\r\na.mp3|One\r\n');
    expect(t.headers).toEqual(['path', 'title']);
    expect(t.rows).toHaveLength(1);
  });
  it('reports wrong field counts but keeps the row', () => {
    const t = parseDelimited('path|title\na.mp3\nb.mp3|x|extra');
    expect(t.rows).toEqual([{ path: 'a.mp3', title: '' }, { path: 'b.mp3', title: 'x' }]);
    expect(t.errors).toEqual(['line 2: expected 2 fields, found 1', 'line 3: expected 2 fields, found 3']);
  });
  it('handles empty input', () => {
    expect(parseDelimited('')).toEqual({ headers: [], rows: [], errors: [] });
  });
});
