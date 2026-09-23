// Rasterize our own SVG mark at installable PWA sizes. No external image service.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const [size, name] of [
    [192, 'icon-192.png'],
    [512, 'icon-512.png'],
    [180, 'apple-touch-icon.png'],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:#7b61ff;width:100%;height:100%}svg{width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    });
    await page.close();
  }
} finally {
  await browser.close();
}
