import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; } })();

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(`${sha} · ${new Date().toISOString().slice(0, 10)}`) },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 }, // no data: URIs — the CSP (font-src 'self') forbids them
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
