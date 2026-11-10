// Bundles the app into one self-contained HTML file (inline CSS/JS) for hosting as a claude.ai artifact.
// Usage: node tools/build-artifact.mjs [out.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist', 'kniffle.html');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const js = readFileSync(join(root, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

// The artifact host already pads the page by the safe-area insets, so the header must not add them again.
const overrides = `
#app { min-height: 100%; }
.top { top: env(safe-area-inset-top, 0px); padding-top: 8px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
`;

const html = `<title>Kniffle</title>
<meta name="theme-color" content="#1f6f5c">
<style>
${css}
${overrides}
</style>
<div id="app"></div>
<script>
${js}
</script>
`;
import('node:fs').then(({ mkdirSync }) => { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html); console.log(`wrote ${out} (${html.length} bytes)`); });
