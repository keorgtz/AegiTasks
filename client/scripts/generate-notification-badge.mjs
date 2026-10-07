// Google Material Icons "done_all", Apache-2.0. Rasterize locally for Android's masked badge.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const svg = await readFile(
  new URL('../public/aegitasks-notification-badge.svg', import.meta.url),
  'utf8',
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async (svg) => {
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,' + btoa(svg);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    canvas.getContext('2d').drawImage(image, 8, 8, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  }, svg);
  await writeFile(
    new URL('../public/aegitasks-notification-badge.png', import.meta.url),
    Buffer.from(png, 'base64'),
  );
} finally {
  await browser.close();
}
