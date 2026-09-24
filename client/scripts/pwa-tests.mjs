import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const client = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.resolve(client, '../artifacts');
const temporary = await mkdtemp(path.join(tmpdir(), 'aegitasks-pwa-'));
const first = path.join(temporary, 'first');
const second = path.join(temporary, 'second');
const results = [];
const pass = (label) => {
  results.push(label);
  console.log(`PASS ${label}`);
};
async function build(outDir) {
  await new Promise((resolve, reject) => {
    const processBuild = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir],
      {
        cwd: client,
        windowsHide: true,
        stdio: 'pipe',
      },
    );
    let log = '';
    processBuild.stdout.on('data', (text) => {
      log += text;
    });
    processBuild.stderr.on('data', (text) => {
      log += text;
    });
    processBuild.on('error', reject);
    processBuild.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(log))));
  });
}
await mkdir(artifacts, { recursive: true });
await build(first);
await build(second);
const versionA = JSON.parse(await readFile(path.join(first, 'version.json'), 'utf8')).version;
const versionB = JSON.parse(await readFile(path.join(second, 'version.json'), 'utf8')).version;
assert.notEqual(versionA, versionB);
pass('Each build receives a unique version without changing package.json');

let deployed = first;
const failures = new Set();
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const cookie = req.headers.cookie || '';
  const broken = [...failures].some((name) => cookie.includes(`scenario=${name}`));
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{}');
    return;
  }
  if (broken && url.pathname.endsWith('.js')) {
    res.writeHead(503);
    res.end();
    return;
  }
  try {
    const relative =
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(deployed, relative);
    if (!file.startsWith(deployed + path.sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const version = (page) => page.locator('meta[name="aegitasks-version"]').getAttribute('content');
async function waitVersion(page, expected) {
  await page.waitForFunction(
    (value) => document.querySelector('meta[name="aegitasks-version"]')?.content === value,
    expected,
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).waitFor();
}
async function tab(context, expected = versionA) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  await waitVersion(page, expected);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return page;
}
async function trigger(page) {
  await page.clock.fastForward(61_000);
}
try {
  browser = await chromium.launch({ headless: true });
  const shared = await browser.newContext();
  const normal = await tab(shared);
  const another = await tab(shared);
  const editor = await tab(shared);
  await normal.evaluate(() => localStorage.setItem('pwa-test-draft', 'keep this draft'));
  await shared.addCookies([{ name: 'session-test', value: 'keep-session', url: origin }]);
  await editor.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<textarea aria-label="Draft">Unsent private note</textarea>';
    document.body.append(dialog);
    dialog.showModal();
  });
  const loginContext = await browser.newContext();
  const login = await tab(loginContext);
  await login.getByLabel('Correo').fill('draft@example.com');
  const offlineContext = await browser.newContext();
  const offline = await tab(offlineContext);
  await offlineContext.setOffline(true);
  const brokenContext = await browser.newContext();
  await brokenContext.addCookies([{ name: 'scenario', value: 'broken', url: origin }]);
  const broken = await tab(brokenContext);
  const fallbackContext = await browser.newContext({ serviceWorkers: 'block' });
  const fallback = await fallbackContext.newPage();
  await fallback.clock.install();
  await fallback.goto(origin);
  await waitVersion(fallback, versionA);
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await tab(mobileContext);
  const backgroundContext = await browser.newContext();
  const background = await tab(backgroundContext);
  // Emulate a suspended PWA's visibility transition; browser workers remain real.
  await background.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }),
  );
  let initialNavigations = 0;
  normal.on('framenavigated', (frame) => {
    if (frame === normal.mainFrame()) initialNavigations++;
  });
  await trigger(normal);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(initialNavigations, 0);
  pass('Initial installation and checks of the same version do not reload the page');

  deployed = second;
  failures.add('broken');
  await trigger(normal);
  await waitVersion(normal, versionB);
  await waitVersion(another, versionB);
  assert.equal(
    await normal.evaluate(() => localStorage.getItem('pwa-test-draft')),
    'keep this draft',
  );
  assert.ok(
    (await shared.cookies()).some(
      (cookie) => cookie.name === 'session-test' && cookie.value === 'keep-session',
    ),
  );
  pass('New deployment automatically updates multiple tabs and preserves cookies/localStorage');
  assert.equal(await version(editor), versionA);
  assert.equal(await editor.getByLabel('Draft').inputValue(), 'Unsent private note');
  await editor.evaluate(() => document.querySelector('dialog').remove());
  await editor.clock.fastForward(1500);
  await waitVersion(editor, versionB);
  pass('An open editor retains its draft; closing it applies the pending update');
  await trigger(login);
  await login.waitForFunction(
    () =>
      navigator.serviceWorker.controller &&
      navigator.serviceWorker.controller.state === 'activated',
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(await version(login), versionA);
  assert.equal(await login.getByLabel('Correo').inputValue(), 'draft@example.com');
  await login.getByLabel('Correo').fill('');
  await login.clock.fastForward(1500);
  await waitVersion(login, versionB);
  pass('Actual React form values defer automatic reload until cleared or submitted');

  await trigger(offline);
  await offline.reload();
  await waitVersion(offline, versionA);
  await offline.clock.fastForward(16_000);
  await offlineContext.setOffline(false);
  await waitVersion(offline, versionB);
  pass('Offline shell remains available and reconnecting installs the deployment');
  await trigger(broken);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  assert.equal(await version(broken), versionA);
  failures.clear();
  await trigger(broken);
  await waitVersion(broken, versionB);
  pass('A failed worker download preserves the working app and retries successfully');
  await trigger(fallback);
  await waitVersion(fallback, versionB);
  pass('Browsers that block service workers update through the version endpoint');
  await trigger(mobile);
  await waitVersion(mobile, versionB);
  pass('Mobile viewport receives automatic updates');
  await trigger(background);
  assert.equal(await version(background), versionA);
  await background.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitVersion(background, versionB);
  pass('Returning a background app to the foreground checks and applies the deployment');
  await trigger(normal);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(initialNavigations, 1);
  pass('The current deployment does not enter a reload loop');

  // Optional migration check against an actual build of the previous release.
  if (process.env.AEGITASKS_LEGACY_DIST) {
    const legacy = path.join(temporary, 'legacy');
    await cp(path.resolve(process.env.AEGITASKS_LEGACY_DIST), legacy, { recursive: true });
    deployed = legacy;
    const legacyContext = await browser.newContext();
    const legacyPage = await legacyContext.newPage();
    await legacyPage.goto(origin);
    // The previous release registers its worker only after login. Register its exact worker here.
    await legacyPage.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await legacyPage.reload();
    await legacyPage.waitForFunction(() => !!navigator.serviceWorker.controller);
    deployed = second;
    await legacyPage.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration()).update();
    });
    await legacyPage.waitForFunction(async (expected) => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return false;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          resolve(false);
        }, 500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve(event.data === expected);
        };
        worker.postMessage({ type: 'AEGITASKS_VERSION' }, [channel.port2]);
      });
    }, versionB);
    await legacyPage.reload();
    await waitVersion(legacyPage, versionB);
    pass('Previous prompt-based worker migrates on reopening/reloading without deleting caches');
  }
  assert.deepEqual(errors, []);
  pass('No uncaught JavaScript exceptions during updates');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    path.join(artifacts, 'pwa-test-results.json'),
    JSON.stringify({ results, versionA, versionB, temporary }, null, 2),
  );
}
