import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildData, FUNCTION_SOURCE, loadFullData } from '../netlify/functions/content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '她知-365天-双击打开.html');
const publicDir = path.join(root, 'public');

const read = (name) => fs.readFile(path.join(publicDir, name), 'utf8');
const readBinary = (name) => fs.readFile(path.join(publicDir, name));
const escapeInlineScript = (source) => source.replace(/<\/script/gi, '<\\/script');
const escapeInlineStyle = (source) => source.replace(/<\/style/gi, '<\\/style');
const dataUrl = (mime, buffer) => `data:${mime};base64,${buffer.toString('base64')}`;

const [html, full] = await Promise.all([read('index.html'), loadFullData()]);
const payload = buildData(full, 'full');
const dataScript = `window.CALENDAR_DATA = ${JSON.stringify(payload)};\n${FUNCTION_SOURCE}`;

const cssFiles = ['styles.css', 'tools.css', 'product-fixes.css', 'content-experience.css'];
const cssText = (await Promise.all(cssFiles.map(read))).join('\n\n');
const background = dataUrl('image/jpeg', await readBinary('assets/background-shanshui-moyu.jpg'));
const css = escapeInlineStyle(
  cssText
    .replaceAll('url("assets/background-shanshui-moyu.jpg")', `url("${background}")`)
    .replaceAll("url('assets/background-shanshui-moyu.jpg')", `url("${background}")`)
);

const inlineScripts = [
  ['content', dataScript],
  ['daily-questions.js', await read('daily-questions.js')],
  ['tools.js', await read('tools.js')],
  ['content-layer.js', await read('content-layer.js')],
  ['launch-config.js', await read('launch-config.js')],
  ['aesthetics.js', await read('aesthetics.js')],
  ['gif.js', await read('gif.js')],
  ['app.js', await read('app.js')],
  ['content-experience.js', await read('content-experience.js')]
];

let bundled = html;
for (const name of cssFiles) {
  bundled = bundled.replace(new RegExp(`\\s*<link rel="stylesheet" href="${name.replace('.', '\\.')}">\\s*`), '\n');
}
bundled = bundled.replace('</head>', `  <style>\n${css}\n  </style>\n</head>`);

bundled = bundled.replace(
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  `<link rel="icon" href="${dataUrl('image/svg+xml', await readBinary('favicon.svg'))}" type="image/svg+xml">`
);

bundled = bundled.replace(
  '  <script src="/api/content"></script>',
  `  <script>\n${escapeInlineScript(dataScript)}\n  </script>`
);
bundled = bundled.replace(
  '  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" async></script>',
  '  <!-- 分享长图功能需要联网；核心阅读功能完全离线。 -->'
);

for (const [name, source] of inlineScripts.slice(1)) {
  bundled = bundled.replace(
    new RegExp(`\\s*<script src="${name.replace('.', '\\.')}"></script>\\s*`),
    `\n  <script>\n${escapeInlineScript(source)}\n  </script>\n`
  );
}

bundled = bundled.replaceAll(
  '<a class="action-btn" href="fun.html">返回抽卡页</a>',
  '<a class="action-btn" href="#card">返回卡片</a>'
);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, bundled, 'utf8');

const outputUrl = pathToFileURL(outputPath).href;
console.log(JSON.stringify({
  output: outputPath,
  url: outputUrl,
  cards: payload.completeDays.length,
  bytes: Buffer.byteLength(bundled)
}, null, 2));
