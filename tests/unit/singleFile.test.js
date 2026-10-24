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

describe('renameHtml', () => {
  const page = (fileName) => ({ type: 'asset', fileName, source: '<html></html>' });
  const ctx = () => {
    const emitted = [];
    return { emitted, emitFile: (f) => emitted.push(f) };
  };

  it('re-emits the only page under the new name', async () => {
    const { renameHtml } = await import('../../build/singleFile.js');
    const bundle = { 'index.html': page('index.html') };
    const c = ctx();
    renameHtml(bundle, 'audioplayer.html', c);
    expect(bundle).toEqual({});
    expect(c.emitted).toEqual([{ type: 'asset', fileName: 'audioplayer.html', source: '<html></html>' }]);
  });

  it('does nothing if the name already matches', async () => {
    const { renameHtml } = await import('../../build/singleFile.js');
    const bundle = { 'audioplayer.html': page('audioplayer.html') };
    const c = ctx();
    renameHtml(bundle, 'audioplayer.html', c);
    expect(Object.keys(bundle)).toEqual(['audioplayer.html']);
    expect(c.emitted).toEqual([]);
  });

  it('refuses to merge several pages into one name', async () => {
    const { renameHtml } = await import('../../build/singleFile.js');
    const bundle = { 'a.html': page('a.html'), 'b.html': page('b.html') };
    expect(() => renameHtml(bundle, 'audioplayer.html', ctx())).toThrow(/expected one HTML page/);
  });
});

describe('inlineAttributes', () => {
  it('replaces linked icons with data: URLs and reports them', async () => {
    const { inlineAttributes } = await import('../../build/singleFile.js');
    const html = '<link rel="icon" href="./assets/fav-1.png" /><link rel="apple-touch-icon" href=\'/assets/touch.png\'>' +
      '<img src="assets/fav-1.png"><a href="./assets/other.png">x</a>';
    const { html: out, inlined } = inlineAttributes(html, {
      'assets/fav-1.png': 'data:image/png;base64,AAA',
      'assets/touch.png': 'data:image/png;base64,BBB',
    });
    expect(out).toBe('<link rel="icon" href="data:image/png;base64,AAA" />' +
      "<link rel=\"apple-touch-icon\" href='data:image/png;base64,BBB'>" +
      '<img src="data:image/png;base64,AAA"><a href="./assets/other.png">x</a>');
    expect(inlined.sort()).toEqual(['assets/fav-1.png', 'assets/touch.png']);
  });
});

describe('inlineBundle', () => {
  it('embeds a linked PNG from the bundle and removes the separate file', async () => {
    const { inlineBundle } = await import('../../build/singleFile.js');
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const bundle = {
      'index.html': { type: 'asset', fileName: 'index.html', source: '<link rel="icon" href="./assets/i.png">' },
      'assets/i.png': { type: 'asset', fileName: 'assets/i.png', source: png },
      'assets/data.bin': { type: 'asset', fileName: 'assets/data.bin', source: png },
    };
    inlineBundle(bundle);
    expect(bundle['index.html'].source).toBe('<link rel="icon" href="data:image/png;base64,iVBORw==">');
    expect(Object.keys(bundle).sort()).toEqual(['assets/data.bin', 'index.html']); // unknown types left alone
  });
});
