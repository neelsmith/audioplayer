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

/** @returns {import('vite').Plugin} */
export function singleFile() {
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
      const files = {};
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') files[name] = item.code;
        else if (name.endsWith('.css')) files[name] = String(item.source);
      }
      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || !item.fileName.endsWith('.html')) continue;
        const { html, inlined } = inlineAssets(String(item.source), files);
        item.source = html;
        for (const name of inlined) delete bundle[name];
      }
    },
  };
}
