import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function resolveReactPkg(name) {
  const local = path.resolve(__dirname, 'node_modules', name);
  if (fs.existsSync(local)) return local;
  return path.resolve(__dirname, '../node_modules', name);
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: resolveReactPkg('react'),
      'react-dom': resolveReactPkg('react-dom'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: { port: 3000, clientPort: 3000 },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
