import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Meu Treino',
        short_name: 'Treino',
        // iOS só entrega Web Push para PWA instalado na tela de início;
        // 'standalone' é o que habilita esse caminho.
        display: 'standalone',
        theme_color: '#16150f',
        background_color: '#f4f2ee',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // O SW principal é regerado a cada build; o handler de push vive fora.
        importScripts: ['/push-sw.js'],
        // As fontes são parte da identidade visual: sem elas no precache, a
        // primeira abertura offline cai na fonte do sistema.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // A mídia vem pela API (bucket privado), então o cache precisa cobrir
        // /api/media para a biblioteca funcionar sem rede na academia.
        runtimeCaching: [
          {
            urlPattern: /\/api\/media\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/catalog\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog' },
          },
        ],
        // Nunca cachear o sync: resposta velha corromperia o cursor.
        navigateFallbackDenylist: [/^\/api\/sync/, /^\/auth/],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    port: 5173,
    // O container precisa aceitar conexões de fora do namespace de rede.
    host: '0.0.0.0',
    watch: { usePolling: true },
  },
})
