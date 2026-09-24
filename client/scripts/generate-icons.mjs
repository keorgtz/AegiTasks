// Resize the approved artwork without redrawing or changing its colors.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const source = new URL(
  '../../design/branding/aegitasks-logo-waves-double-check-v2-purple.png',
  import.meta.url,
);
const dataUrl = `data:image/png;base64,${(await readFile(source)).toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [size, name] of [
    [32, 'aegitasks-favicon-32.png'],
    [64, 'aegitasks-favicon-64.png'],
    [180, 'aegitasks-apple-touch-icon.png'],
    [192, 'aegitasks-icon-192.png'],
    [512, 'aegitasks-icon-512.png'],
  ]) {
    const png = await page.evaluate(
      async ({ dataUrl, size }) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { dataUrl, size },
    );
    await writeFile(new URL(`../public/${name}`, import.meta.url), Buffer.from(png, 'base64'));
    console.log(`Generated ${name} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
