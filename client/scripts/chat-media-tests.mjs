import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/chatGif.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { gifLinks, mediaToken, withoutGifLinks, remoteGif, searchKlipy } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let checks = 0;
const pass = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};
const url = 'https://static.klipy.com/a/sticker.webp?original=(value)&token=kept';
const sticker = remoteGif(url, 'sticker');
assert.ok(sticker);
assert.equal(sticker.url, url);
assert.equal(remoteGif(url), null);
const token = mediaToken(sticker);
const mixed = `Text https://static.klipy.com/one.gif\n${token}\nEnd`;
assert.deepEqual(
  gifLinks(mixed).map((m) => m.kind),
  ['gif', 'sticker'],
);
assert.equal(gifLinks(mixed)[1].url, url);
assert.equal(withoutGifLinks(mixed), 'Text \n\nEnd');
assert.equal(withoutGifLinks(token), '');
assert.equal(gifLinks(token + token).length, 1);
pass(
  'Sticker tokens preserve punctuation/query URLs, media order and surrounding text without duplicate previews',
);
for (const invalid of [
  'http://static.klipy.com/a.png',
  'https://static.klipy.com.evil.example/a.png',
  'https://user@static.klipy.com/a.png',
  'https://static.klipy.com/a.svg',
  'https://static.klipy.com/a.png#fragment',
  'https://static.klipy.com:444/a.png',
  'https://media.tenor.com/a.png',
  'https://constructor/a.png',
]) {
  assert.equal(remoteGif(invalid, 'sticker'), null);
  assert.equal(gifLinks(`![Sticker KLIPY](<${invalid}>)`).length, 0);
}
assert.equal(gifLinks('https://static.klipy.com/unmarked.png').length, 0);
pass(
  'Only explicit KLIPY raster sticker tokens render; unsafe hosts, schemes, credentials, SVG and bare PNG links remain text',
);
const originalFetch = globalThis.fetch;
try {
  for (const format of ['webp', 'gif', 'png']) {
    const media = `https://static.klipy.com/sent.${format}?untouched=1`;
    globalThis.fetch = async (address, options) => {
      const request = new URL(address);
      assert.equal(request.pathname, '/api/v1/shared-browser-key/stickers/search');
      assert.equal(request.searchParams.get('q'), 'hola');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      return Response.json({
        result: true,
        data: {
          data: [
            {
              id: 1,
              slug: 'hola',
              title: 'Hola',
              type: 'sticker',
              file: { hd: { [format]: { url: media } } },
            },
          ],
          has_next: false,
        },
      });
    };
    const results = await searchKlipy(
      'shared-browser-key',
      'hola',
      1,
      new AbortController().signal,
      'stickers',
    );
    assert.equal(results.items[0].url, media);
    assert.equal(results.items[0].preview, media);
    pass(`Sticker catalogue supports ${format} with original URL and preview fallback`);
  }
  globalThis.fetch = async () =>
    Response.json({
      result: true,
      data: {
        data: [
          {
            id: 1,
            slug: 'ad',
            type: 'ad',
            file: { hd: { gif: { url: 'https://static.klipy.com/ad.gif' } } },
          },
        ],
        has_next: false,
      },
    });
  await assert.rejects(
    searchKlipy('test', '', 1, new AbortController().signal, 'stickers'),
    /sin anuncios/,
  );
  pass('Unsupported ad response is reported rather than mixing or filtering catalogue content');
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`${checks} chat media checks passed`);
