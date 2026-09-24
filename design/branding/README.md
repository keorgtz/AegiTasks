# AegiTasks branding

The approved logo is `aegitasks-logo-waves-double-check-v2-purple.png`: purple waves with a white double checkmark. Keep its colors and geometry unchanged.

The shared `Brand` component uses a resized copy of this artwork for the application shell and authentication screens. Browser favicons, the Apple touch icon, and the PWA icons use the same source. The white mark fits inside the PWA maskable safe circle; the background extends to every edge.

To regenerate the committed public assets, run `npm run generate:icons` from `client/` with Playwright Chromium installed. This only resizes the approved image; it does not invoke image generation. Run `npm run build` afterward to refresh the manifest and service worker precache. Production builds use the committed assets without requiring Chromium.
