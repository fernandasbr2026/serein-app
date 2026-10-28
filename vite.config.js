import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// PWA: deja instalar el ERP en el celular (icono en la pantalla de inicio), igual que COPRESEG.
// El service worker solo guarda los archivos de la app; los datos siguen viniendo siempre de Supabase.
export default defineConfig({
  // Auditoría X-2: antes todo salía en UN archivo de 3,4 MB que se volvía a bajar entero tras cada despliegue.
  // Las librerías grandes van en trozos propios (cambian casi nunca, así que el navegador los conserva) y las
  // pantallas de uso ocasional se cargan al abrirlas (React.lazy en Dashboard.jsx).
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          lucide: ['lucide-react'],
          xlsx: ['xlsx'],
          jspdf: ['jspdf'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'SEREIN · Panel de Gestión',
        short_name: 'SEREIN',
        description: 'ERP de Serein Group: OT, cotizaciones, compras, facturas y producción',
        lang: 'es-CL',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        categories: ['business', 'productivity'],
        background_color: '#FFFFFF',
        theme_color: '#F77716',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
})
