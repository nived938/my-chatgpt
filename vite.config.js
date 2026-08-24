import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['my-chatgpt-frontend.onrender.com']
  }
});
