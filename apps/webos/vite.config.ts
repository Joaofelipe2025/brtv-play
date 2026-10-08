import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativo: o .ipk é servido a partir de file-like paths dentro do pacote webOS
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // webOS 5 (2020) roda Chromium 68: piso de compatibilidade do app
    target: 'chrome68',
    cssTarget: 'chrome68',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
