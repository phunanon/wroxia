// Typesets the Constitution and its Instruments as a PDF (Wroxia.pdf in this
// directory, or the path given) using Playwright (npm install here first).
// Usage: npm start [-- out.pdf]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(process.argv[2] ?? join(import.meta.dirname, 'Wroxia.pdf'));
const text = (f) =>
  readFileSync(join(root, f), 'utf8')
    .replaceAll('\r\n', '\n')
    .replace(/^<p [^>]*>.*<\/p>\n*/m, '');

const inline = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)_(.+?)_(?!\w)/g, '$1<i>$2</i>');

// Markdown subset: headings, paragraphs, nested lists (indent decides depth).
function render(md) {
  let html = '';
  const open = []; // stack of { indent, tag }
  const close = (to = -1) => {
    while (open.length && open.at(-1).indent > to)
      html += `</li></${open.pop().tag}>`;
  };
  let para = false;
  for (const line of md.split('\n')) {
    const item = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    const head = line.match(/^(#+)\s+(.*)/);
    if (item || head) para = false;
    if (item) {
      const [, sp, mark, body] = item;
      const tag = /\d/.test(mark) ? 'ol' : 'ul';
      close(sp.length);
      if (open.at(-1)?.indent === sp.length) html += '</li>';
      else {
        const start =
          tag === 'ol' && mark !== '1.' ? ` start="${parseInt(mark)}"` : '';
        html += `<${tag}${start}>`;
        open.push({ indent: sp.length, tag });
      }
      html += `<li>${inline(body)}`;
    } else if (open.length && /^\s+\S/.test(line))
      html += ' ' + inline(line.trim());
    else {
      close();
      if (head)
        html += `<h${head[1].length}>${inline(head[2])}</h${head[1].length}>`;
      else if (!line.trim()) para = false;
      else if (para) html = html.slice(0, -4) + ' ' + inline(line) + '</p>';
      else ((para = true), (html += `<p>${inline(line)}</p>`));
    }
  }
  close();
  return html;
}

const css = `
@page { size: A4; margin: 24mm 22mm 26mm;
  @bottom-center { content: counter(page); font: 9pt Cambria, 'Times New Roman', serif; color: #777; } }
@page :first { @bottom-center { content: none; } }
body { font: 10.5pt/1.5 Cambria, 'Times New Roman', 'Liberation Serif', serif; font-variant-numeric: lining-nums; color: #222; hyphens: auto; }
.cover { height: 235mm; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; page-break-after: always; }
.cover img { width: 120mm; border: 1px solid #ccc; }
.cover h1 { font-size: 34pt; font-weight: normal; letter-spacing: .06em; margin: 14mm 0 2mm; }
.cover p { font-style: italic; color: #666; margin: 0; }
h1 { font-size: 24pt; font-weight: normal; text-align: center; letter-spacing: .04em;
  margin: 0 0 10mm; page-break-before: always; }
.cover h1 { page-break-before: auto; }
h2 { font-size: 15pt; font-weight: normal; text-transform: uppercase; letter-spacing: .12em;
  border-bottom: .5pt solid #999; padding-bottom: 2mm; margin: 12mm 0 4mm;
  break-after: avoid; }
h3 { font-size: 11.5pt; margin: 7mm 0 2mm; color: #7a1f1f; break-after: avoid; }
p { margin: 0 0 2.5mm; }
ol, ul { margin: 1mm 0 2mm; padding-left: 7mm; }
li { margin: 0 0 1.2mm; break-inside: avoid-page; }
li > ol, li > ul { margin-top: 1mm; }
ul { list-style: '–  '; }
li::marker { color: #7a1f1f; }
`;

const html = `<!doctype html><meta charset="utf-8"><title>Constitution of Wroxia</title>
<style>${css}</style>
<div class="cover"><img src="data:image/svg+xml;base64,${readFileSync(join(root, 'Wroxia.svg')).toString('base64')}">
<h1>Wroxia</h1><p>Constitution and Instruments</p></div>
${render(text('Constitution.md'))}${render(text('Instruments.md'))}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log(out);
