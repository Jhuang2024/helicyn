/**
 * One-time extraction of the long-form technical report body into a static
 * asset served only on /report. Keeps the 10MB document out of the JS bundle
 * and fixes the known section-7 heading bug (a leaked literal "## 7." that left
 * section 7 without an <h2>/anchor).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'legacy/report.html'), 'utf8');

const styleMatch = /<style>([\s\S]*?)<\/style>/i.exec(src);
const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(src);
if (!mainMatch) throw new Error('report main not found');

let body = mainMatch[1];

// Fix section 7: split the leaked literal heading into a real, anchored <h2>.
body = body.replace(
  /open\.## 7\. Comparative Analysis<\/p>/,
  'open.</p>\n<h2 data-reveal id="comparative-analysis">7. Comparative Analysis</h2>',
);

// Preserve every figure, but stop transferring all image bytes in the HTML fetch.
const assets = join(root, 'public/report-assets');
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
let figureCount = 0;
body = body.replace(/<img\b([^>]*?)src="data:image\/png;base64,([A-Za-z0-9+/=\s]+)"([^>]*)>/g, (_match, before, encoded, after) => {
  const bytes = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  writeFileSync(join(assets, `${hash}.png`), bytes);
  figureCount++;
  const dimensions = bytes.length > 24 && bytes.subarray(1, 4).toString() === 'PNG'
    ? ` width="${bytes.readUInt32BE(16)}" height="${bytes.readUInt32BE(20)}"` : '';
  return `<img${before}src="/report-assets/${hash}.png"${after} loading="lazy" decoding="async"${dimensions}>`;
});
console.log(`Extracted ${figureCount} report figures into cacheable assets.`);

const style = styleMatch ? `<style>${styleMatch[1]}</style>\n` : '';
const out = style + body;

writeFileSync(join(root, 'public/report-body.html'), out, 'utf8');
console.log(`Wrote public/report-body.html (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
