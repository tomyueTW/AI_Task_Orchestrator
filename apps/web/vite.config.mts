import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/tasks': 'http://localhost:3000',
      '/workflows': 'http://localhost:3000',
      '/metrics': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/stream': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
  },
});
