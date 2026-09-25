import assert from 'node:assert/strict';
import path from 'node:path';

function waveFile() {
  const rate = 22050,
    samples = rate * 20;
  const file = Buffer.alloc(44 + samples * 2);
  file.write('RIFF');
  file.writeUInt32LE(file.length - 8, 4);
  file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write('data', 36);
  file.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    file.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 2 * 440) * 5000), 44 + i * 2);
  return file;
}

export async function testFocusVisuals({ page, admin, support, json, pass, artifacts }) {
  const original = (await json(admin, 'GET', '/focus')).profile;
  const other = (await json(support, 'GET', '/focus')).profile;
  for (const theme of ['fireflies', 'breeze', 'constellation', 'codeRain', 'geometry']) {
    const saved = await json(admin, 'PUT', '/focus/profile', {
      ...original,
      theme,
      accentColor: '#38bdf8',
      particleShape: 'hexagons',
    });
    assert.equal(saved.theme, theme);
    assert.equal(saved.accentColor, '#38BDF8');
    assert.equal(saved.particleShape, 'hexagons');
  }
  for (const change of [
    { theme: 'unknown' },
    { accentColor: 'red' },
    { accentColor: '#123456\n' },
    { particleShape: 'star' },
  ])
    await json(admin, 'PUT', '/focus/profile', { ...original, ...change }, 400);
  const { accentColor: _color, particleShape: _shape, ...legacy } = original;
  await json(admin, 'PUT', '/focus/profile', legacy);
  assert.equal((await json(admin, 'GET', '/focus')).profile.accentColor, '#38BDF8');
  assert.deepEqual((await json(support, 'GET', '/focus')).profile, other);
  pass(
    'Five new visual profiles validate and persist colors/shapes privately; older clients preserve the new settings',
  );

  // Real Web Audio graph/FFT. Only the OS picker and device stream acquisition are simulated.
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const qa = (window.focusAudioQA = {
      calls: [],
      contexts: [],
      tracks: [],
      generators: [],
      mode: 'ok',
      peak: 0,
      reads: 0,
    });
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        qa.contexts.push(this);
      }
      createAnalyser() {
        const analyser = super.createAnalyser();
        const read = analyser.getByteFrequencyData.bind(analyser);
        analyser.getByteFrequencyData = (data) => {
          read(data);
          qa.reads++;
          qa.peak = Math.max(...data);
        };
        return analyser;
      }
    };
    qa.makeStream = (video) => {
      const ctx = new NativeAudioContext();
      qa.generators.push(ctx);
      void ctx.resume();
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      const destination = ctx.createMediaStreamDestination();
      osc.connect(destination);
      osc.start();
      const tracks = qa.mode === 'noaudio' ? [] : destination.stream.getAudioTracks();
      if (video) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        tracks.push(...canvas.captureStream(1).getVideoTracks());
      }
      qa.tracks.push(...tracks);
      return new MediaStream(tracks);
    };
    for (const [method, video] of [
      ['getDisplayMedia', true],
      ['getUserMedia', false],
    ]) {
      Object.defineProperty(navigator.mediaDevices, method, {
        configurable: true,
        value: async (options) => {
          qa.calls.push({ method, options });
          if (qa.mode === 'denied') throw new DOMException('Denied for test', 'NotAllowedError');
          if (qa.mode === 'pending')
            return new Promise((resolve) => {
              qa.resolve = () => resolve(qa.makeStream(video));
            });
          return qa.makeStream(video);
        },
      });
    }
  });
  await page.goto('http://localhost:4174/#focus');
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Animaciones de fondo').check();
  const select = page.getByLabel('Ambiente visual');
  assert.equal(await select.locator('option').count(), 8);
  for (const theme of ['fireflies', 'breeze', 'constellation', 'codeRain', 'geometry']) {
    await select.selectOption(theme);
    await page.locator('.focus-backdrop-canvas[data-animating="true"]').waitFor();
    await page
      .locator('.focus-stage')
      .screenshot({ path: path.join(artifacts, `focus-new-${theme}.png`) });
  }
  assert.equal(await page.evaluate(() => window.focusAudioQA.calls.length), 0);
  await page.getByLabel('Color del ambiente').fill('#22c55e');
  await page.getByLabel('Forma de las partículas').selectOption('triangles');
  const savedResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/focus/profile') && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
  assert.equal((await savedResponse).status(), 200);
  await page.reload();
  await page.locator('.focus-geometry').waitFor();
  assert.equal(await page.getByLabel('Color del ambiente').inputValue(), '#22c55e');
  assert.equal(await page.getByLabel('Forma de las partículas').inputValue(), 'triangles');
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.evaluate(
      (width) => (document.documentElement.dataset.theme = width === 390 ? 'light' : 'dark'),
      width,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Ampliar en esta pestaña', exact: true }).click();
    const stage = page.locator('.focus-stage.is-immersive');
    assert(await stage.evaluate((el) => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: path.join(artifacts, `focus-geometry-${width}.png`) });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByLabel('Animaciones de fondo').uncheck();
  await page.locator('.focus-backdrop-canvas[data-animating="false"]').waitFor();
  const still = await page.locator('.focus-backdrop-canvas').evaluate((el) => el.toDataURL());
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('.focus-backdrop-canvas').evaluate((el) => el.toDataURL()),
    still,
  );
  await page.getByLabel('Animaciones de fondo').check();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.focus-spectrum[data-animating="false"]').waitFor();
  await page.locator('.focus-audio-reduced').waitFor();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('.focus-backdrop-canvas[data-animating="false"]').waitFor();
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('.focus-backdrop-canvas[data-animating="true"]').waitFor();
  pass(
    'All eight environments render; custom visuals persist, fit phones/desktop and stop for reduced motion, disabled animation or hidden tabs',
  );

  const share = page.getByRole('button', { name: 'Compartir audio', exact: true });
  const stop = page.getByRole('button', { name: 'Desconectar audio', exact: true });
  await page.evaluate(() => (window.focusAudioQA.mode = 'denied'));
  await share.click();
  await page.getByRole('alert').filter({ hasText: 'No se concedió' }).waitFor();
  assert(
    await page.evaluate(() => window.focusAudioQA.contexts.every((c) => c.state === 'closed')),
  );
  await page.evaluate(() => (window.focusAudioQA.mode = 'noaudio'));
  await share.click();
  await page.getByRole('alert').filter({ hasText: 'no compartió audio' }).waitFor();
  assert(
    await page.evaluate(() => window.focusAudioQA.tracks.every((t) => t.readyState === 'ended')),
  );
  await page.evaluate(() => (window.focusAudioQA.mode = 'ok'));
  await share.click();
  await page.getByText('Audio compartido conectado', { exact: true }).waitFor();
  await page.waitForFunction(() => window.focusAudioQA.peak > 50);
  assert((await page.locator('.focus-stage').getAttribute('data-update-blocked')) === 'true');
  const capture = await page.evaluate(() => window.focusAudioQA.calls.at(-1));
  assert.equal(capture.options.systemAudio, 'include');
  assert.equal(capture.options.video, true);
  await page.getByRole('button', { name: 'Ampliar en esta pestaña', exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, 'focus-spectrum-active.png') });
  await page.keyboard.press('Escape');
  await stop.click();
  assert(
    await page.evaluate(() => window.focusAudioQA.tracks.every((t) => t.readyState === 'ended')),
  );
  await page.getByRole('button', { name: 'Usar micrófono', exact: true }).click();
  await page.getByText('Micrófono conectado', { exact: true }).waitFor();
  await select.selectOption('breeze');
  await page.waitForFunction(() => window.focusAudioQA.contexts.every((c) => c.state === 'closed'));
  assert(
    await page.evaluate(() => window.focusAudioQA.tracks.every((t) => t.readyState === 'ended')),
  );
  await select.selectOption('geometry');
  await share.click();
  await stop.waitFor();
  await page.evaluate(() =>
    window.focusAudioQA.tracks
      .find((t) => t.readyState === 'live')
      .dispatchEvent(new Event('ended')),
  );
  await page
    .getByText('La fuente dejó de compartir audio. Puedes conectarla de nuevo.', { exact: true })
    .waitFor();
  await page.evaluate(() => (window.focusAudioQA.mode = 'pending'));
  await share.click();
  await page.getByRole('button', { name: 'Cancelar conexión', exact: true }).click();
  await page.evaluate(() => window.focusAudioQA.resolve());
  await page.waitForFunction(() =>
    window.focusAudioQA.tracks.every((t) => t.readyState === 'ended'),
  );
  pass(
    'Real FFT responds to supplied audio streams; denied/missing audio, cancellation, stopped sharing and theme changes release capture without auto permissions',
  );

  const uploads = [];
  const watch = (request) => {
    if (['POST', 'PUT'].includes(request.method())) uploads.push(request.url());
  };
  page.on('request', watch);
  const file = page.getByLabel('Archivo de audio local');
  for (const name of ['tone-one.wav', 'tone-two.wav']) {
    await file.setInputFiles({ name, mimeType: 'audio/wav', buffer: waveFile() });
    await page.getByText(`Archivo local · ${name}`, { exact: true }).waitFor();
    await page.waitForFunction(() => window.focusAudioQA.peak > 50);
    assert(await page.locator('audio').evaluate((el) => !el.paused && el.currentTime > 0));
  }
  assert.deepEqual(uploads, []);
  await page.locator('audio').evaluate((el) => el.pause());
  await page.waitForFunction(() => window.focusAudioQA.peak === 0);
  const silent = await page.locator('.focus-spectrum').evaluate((el) => el.toDataURL());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.focus-spectrum').evaluate((el) => el.toDataURL()), silent);
  page.off('request', watch);
  await page.evaluate(() => (location.hash = '#tasks'));
  await page.waitForFunction(() => window.focusAudioQA.contexts.every((c) => c.state === 'closed'));
  assert.equal(await page.locator('audio').count(), 0);
  await page.evaluate(async () => {
    await Promise.all(window.focusAudioQA.generators.map((c) => c.close()));
  });
  // Emulate a browser without screen/audio device capture; local playback must remain available.
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: undefined,
    });
    location.hash = '#focus';
  });
  await page.locator('.focus-geometry').waitFor();
  assert(await share.isDisabled());
  assert(await page.getByRole('button', { name: 'Usar micrófono', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: 'Reproducir archivo', exact: true }).isEnabled());
  await page
    .getByText('Este navegador no ofrece captura del audio de otras apps.', { exact: false })
    .waitFor();
  pass(
    'Local WAV playback feeds the real spectrum, supports replacing files, makes no uploads and releases audio on navigation; unsupported capture has a clear fallback',
  );
  await json(admin, 'PUT', '/focus/profile', original);
  await page.reload();
  await page.getByRole('heading', { name: 'Focus Mode.' }).waitFor();
}
