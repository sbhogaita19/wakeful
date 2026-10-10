import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 }, // no data: URIs — the CSP (font-src 'self') forbids them
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
