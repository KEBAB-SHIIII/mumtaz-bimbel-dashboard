import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

/** Backend lokal; sama dengan `FRONTEND_ORIGIN` + `PORT` di backend/.env. */
const API_ORIGIN = 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `source` memakai TypeScript @mumtaz/contracts langsung tanpa build terpisah.
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    strictPort: true,
    // Hot reload di :5173 memakai backend yang sama (:3001). Header Origin diganti menjadi origin
    // backend (= FRONTEND_ORIGIN di backend/.env) agar cek CSRF/Origin lolos tanpa env kedua.
    proxy: { '/api': { target: API_ORIGIN, headers: { origin: API_ORIGIN } } },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor dipisah per kelompok: jarang berubah → cache browser bertahan lintas deploy.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'vendor-data', test: /node_modules[\\/](@tanstack|axios|zod)[\\/]/ },
            { name: 'vendor-ui', test: /node_modules[\\/](@headlessui|@floating-ui|@react-aria|lucide-react)[\\/]/ },
            { name: 'vendor-motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            { name: 'vendor-form', test: /node_modules[\\/](react-hook-form|@hookform)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Alur UI multi-langkah (login → halaman lazy → form) di jsdom paralel butuh lebih dari default 5 detik.
    testTimeout: 15_000,
  },
});
