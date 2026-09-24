import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { randomUUID } from 'node:crypto';

const buildVersion = randomUUID();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
  plugins: [
    react(),
    {
      name: 'aegitasks-build-version',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: { name: 'aegitasks-version', content: buildVersion },
            injectTo: 'head',
          },
        ];
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: buildVersion }),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'sw-version.js',
          source: `self.addEventListener('message', event => { if (event.data?.type === 'AEGITASKS_VERSION') event.ports[0]?.postMessage(${JSON.stringify(buildVersion)}); });`,
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'aegitasks-favicon-32.png',
        'aegitasks-favicon-64.png',
        'aegitasks-icon-192.png',
        'aegitasks-icon-512.png',
        'aegitasks-apple-touch-icon.png',
      ],
      manifest: {
        name: 'AegiTasks',
        short_name: 'AegiTasks',
        lang: 'es',
        description: 'Los pendientes de tu equipo, en un solo lugar.',
        theme_color: '#f5f6fb',
        background_color: '#f5f6fb',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          { src: '/aegitasks-icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/aegitasks-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['/sw-version.js'],
        globIgnores: ['**/sw-version.js', '**/version.json'],
        navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/, /^\/sw(?:-version)?\.js$/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:5213' } },
  preview: { port: 4174, strictPort: true, proxy: { '/api': 'http://localhost:5213' } },
});
