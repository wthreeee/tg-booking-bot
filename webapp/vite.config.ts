import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Туннели (cloudflared, ngrok) приходят с чужим Host — разрешаем их в режиме разработки
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:3000' }
  }
});
