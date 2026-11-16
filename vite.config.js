import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// HTTPS tunnels used to test on a phone (see SETUP.md, "Uji login di HP").
const TUNNEL_HOSTS = ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Fills {{CONTACT_EMAIL}} and {{BUY_URL}} in the public pages (tentang.html,
 * privasi.html) from VITE_CONTACT_EMAIL and VITE_BUY_URL. Values are HTML-escaped.
 */
function pagePlaceholders(env) {
  const buy = /^https?:\/\//i.test(env.VITE_BUY_URL || '') ? env.VITE_BUY_URL : './';
  const contact = env.VITE_CONTACT_EMAIL || '';
  return {
    name: 'kelar-page-placeholders',
    transformIndexHtml(html) {
      if (!html.includes('{{')) return html;
      if (!contact) console.warn('[kelar] VITE_CONTACT_EMAIL is empty: the privacy page has no contact email.');
      return html
        .replaceAll('{{CONTACT_EMAIL}}', escapeHtml(contact || 'email-kontak-belum-diisi@example.com'))
        .replaceAll('{{BUY_URL}}', escapeHtml(buy));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // GitHub Pages serves project sites from /<repo-name>/. Set VITE_BASE in CI.
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { port: 5173, strictPort: true, allowedHosts: TUNNEL_HOSTS },
    // Same port as dev, so the registered OAuth origins (localhost:5173 and the
    // ngrok domain) also work for `npm run preview` (stop `npm run dev` first).
    preview: { port: 5173, strictPort: true, allowedHosts: TUNNEL_HOSTS },
    build: {
      rollupOptions: {
        // The app plus two public pages needed for Google's OAuth branding.
        input: { main: 'index.html', tentang: 'tentang.html', privasi: 'privasi.html' },
      },
    },
    plugins: [
      pagePlaceholders(env),
      VitePWA({
        registerType: 'prompt', // show "Versi baru tersedia" instead of reloading by itself
        injectRegister: false, // registered from src/core/pwa.js
        includeAssets: ['icons/favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'brand/*.svg'],
        manifest: {
          name: 'Kelar — Tracker Lamaran',
          short_name: 'Kelar Lamaran',
          description: 'Catat lamaran kerja, pengingat follow-up, jadwal interview, dan statistik. Datamu di Google Drive-mu sendiri.',
          lang: 'id',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#3D5BF0',
          background_color: '#F8F7FB',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App shell only. Nothing from Google (googleapis.com, accounts.google.com,
          // script.google.com) is cached: there is no runtimeCaching, and the
          // precache only contains our own build files.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // The social preview image is only for link previews, not needed offline.
          globIgnores: ['og-image-*.png'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      include: ['test/**/*.test.js'],
      environment: 'node',
    },
  };
});
