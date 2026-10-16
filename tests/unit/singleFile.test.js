import { describe, it, expect } from 'vitest';
import { inlineAssets } from '../../build/singleFile.js';

const page = `<head><script type="module" crossorigin src="./assets/index-a1.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-b2.css"></head><body></body>`;

describe('inlineAssets', () => {
  it('inlines referenced JS and CSS and reports what it inlined', () => {
    const { html, inlined } = inlineAssets(page, {
      'assets/index-a1.js': 'console.log(1)',
      'assets/index-b2.css': 'body{color:red}',
    });
    expect(html).toContain('<script type="module">console.log(1)</script>');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).not.toMatch(/src=|href=/);
    expect(inlined.sort()).toEqual(['assets/index-a1.js', 'assets/index-b2.css']);
  });

  it('accepts absolute and bare paths', () => {
    const { html } = inlineAssets('<script type="module" src="/a.js"></script><script src="b.js"></script>', {
      'a.js': 'A', 'b.js': 'B',
    });
    expect(html).toBe('<script type="module">A</script><script type="module">B</script>');
  });

  it('escapes closing tags inside inlined code', () => {
    const { html } = inlineAssets('<script src="./a.js"></script><link rel="stylesheet" href="./a.css">', {
      'a.js': 'let s = "</script>";',
      'a.css': '/* </style> */',
    });
    expect(html).toContain('"<\\/script>"');
    expect(html).toContain('/* <\\/style> */');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('does not treat "$" in code as a replacement pattern', () => {
    const { html } = inlineAssets('<script src="./a.js"></script>', { 'a.js': "x.replace(/a/, '$&$1')" });
    expect(html).toContain("'$&$1'");
  });

  it('leaves unreferenced files and unrelated tags alone', () => {
    const src = '<script src="https://example.com/x.js"></script>';
    const { html, inlined } = inlineAssets(src, { 'assets/other.js': 'X' });
    expect(html).toBe(src);
    expect(inlined).toEqual([]);
  });
});
