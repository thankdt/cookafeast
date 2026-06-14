import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'cookafeast — Lo cỗ nhẹ nhàng',
        short_name: 'cookafeast',
        description: 'Người bạn đồng hành điềm tĩnh giúp bạn lo cỗ, cơm cúng cho các dịp của gia đình.',
        lang: 'vi',
        theme_color: '#9B2D20',
        background_color: '#FBF7F0',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8088',
      '/socket': { target: 'ws://localhost:8088', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
