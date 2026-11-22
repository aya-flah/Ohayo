import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Sonae',
        short_name: 'Sonae',
        description: 'Outage-proof irrigation for Tunisian GDAs: pump ahead, water by gravity, fair turns by SMS.',
        lang: 'en',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b121e',
        theme_color: '#0b121e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(api|archive-api)\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather', expiration: { maxEntries: 20, maxAgeSeconds: 3 * 86400 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
