/**
 * Minimal Vite plugin that inlines the built JS and CSS into index.html,
 * so the app is a single self-contained file that works from file://.
 * Replaces vite-plugin-singlefile (whose micromatch→braces dependency
 * triggered npm audit warnings). No dependencies.
 */

/** Make code safe to place inside a <script> element. */
const escapeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
/** Make CSS safe to place inside a <style> element. */
const escapeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');

/** Escape a string for use inside a RegExp. */
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pure transform: replace <script src> and <link rel=stylesheet href> tags that
 * point at known bundle files with inline <script>/<style> elements.
 *
 * @param {string} html
 * @param {Record<string, string>} files  bundle fileName → contents (e.g. "assets/index-abc.js")
 * @returns {{ html: string, inlined: string[] }} new html and the fileNames that were inlined
 */
export function inlineAssets(html, files) {
  const inlined = [];
  for (const [fileName, contents] of Object.entries(files)) {
    // Matches src="./assets/x.js", src="/assets/x.js" or src="assets/x.js"
    const ref = `(?:\\./|/)?${reEscape(fileName)}`;
    if (fileName.endsWith('.js')) {
      const tag = new RegExp(`<script\\b[^>]*\\bsrc=["']${ref}["'][^>]*>\\s*</script>`, 'g');
      const next = html.replace(tag, () => `<script type="module">${escapeScript(contents)}</script>`);
      if (next !== html) inlined.push(fileName);
      html = next;
    } else if (fileName.endsWith('.css')) {
      const tag = new RegExp(`<link\\b[^>]*\\bhref=["']${ref}["'][^>]*>`, 'g');
      const next = html.replace(tag, () => `<style>${escapeStyle(contents)}</style>`);
      if (next !== html) inlined.push(fileName);
      html = next;
    }
  }
  return { html, inlined };
}

/**
 * @param {{ fileName?: string }} [options]  fileName renames the (single) output page,
 *   e.g. "audioplayer.html" instead of Vite's "index.html"
 * @returns {import('vite').Plugin}
 */
export function singleFile({ fileName } = {}) {
  return {
    name: 'audioplayer:single-file',
    enforce: 'post',
    apply: 'build',
    config: () => ({
      base: './',
      build: {
        assetsInlineLimit: Number.MAX_SAFE_INTEGER, // images/fonts become data: URLs
        cssCodeSplit: false,
        modulePreload: { polyfill: false },
      },
    }),
    generateBundle(_options, bundle) {
      inlineBundle(bundle);
      if (fileName) renameHtml(bundle, fileName, this);
    },
  };
}

/** MIME types for binary assets the page may link to (icons, images, fonts). */
export const ASSET_TYPES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2',
});

/**
 * Pure transform: replace href="…" / src="…" attributes that point at known
 * bundle files with data: URLs. (Vite inlines assets imported from JS/CSS, but
 * not ones linked from the HTML itself, e.g. <link rel="icon">.)
 *
 * @param {string} html
 * @param {Record<string, string>} dataUrls  bundle fileName → data: URL
 * @returns {{ html: string, inlined: string[] }}
 */
export function inlineAttributes(html, dataUrls) {
  const inlined = [];
  for (const [fileName, url] of Object.entries(dataUrls)) {
    const attr = new RegExp(`\\b(href|src)=(["'])(?:\\./|/)?${reEscape(fileName)}\\2`, 'g');
    const next = html.replace(attr, (_m, name, q) => `${name}=${q}${url}${q}`);
    if (next !== html) inlined.push(fileName);
    html = next;
  }
  return { html, inlined };
}

/** data: URL for a Rollup asset, or null if its type isn't one we embed. */
function toDataUrl(fileName, source) {
  const mime = ASSET_TYPES[fileName.split('.').pop().toLowerCase()];
  if (!mime) return null;
  const bytes = typeof source === 'string' ? Buffer.from(source) : Buffer.from(source);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** Inline JS/CSS and linked images into each HTML page of a Rollup bundle (mutates it). */
export function inlineBundle(bundle) {
  const files = {};
  for (const [name, item] of Object.entries(bundle)) {
    if (item.type === 'chunk') files[name] = item.code;
    else if (name.endsWith('.css')) files[name] = String(item.source);
  }
  const dataUrls = {};
  for (const [name, item] of Object.entries(bundle)) {
    if (item.type !== 'asset') continue;
    const url = toDataUrl(name, item.source);
    if (url) dataUrls[name] = url;
  }
  for (const item of Object.values(bundle)) {
    if (item.type !== 'asset' || !item.fileName.endsWith('.html')) continue;
    const a = inlineAssets(String(item.source), files);
    const b = inlineAttributes(a.html, dataUrls);
    item.source = b.html;
    for (const name of [...a.inlined, ...b.inlined]) delete bundle[name];
  }
}

/**
 * Re-emit the bundle's only HTML page under `fileName`. Throws if there isn't
 * exactly one page (renaming several to one name would lose pages).
 * @param {{ emitFile: Function }} ctx  the plugin context (`this` in generateBundle)
 */
export function renameHtml(bundle, fileName, ctx) {
  const pages = Object.values(bundle).filter((i) => i.type === 'asset' && i.fileName.endsWith('.html'));
  if (pages.length !== 1) throw new Error(`singleFile: expected one HTML page to rename, found ${pages.length}`);
  const [page] = pages;
  if (page.fileName === fileName) return;
  delete bundle[page.fileName];
  ctx.emitFile({ type: 'asset', fileName, source: page.source });
}
