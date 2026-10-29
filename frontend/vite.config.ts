import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `source` memakai TypeScript @mumtaz/contracts langsung tanpa build terpisah.
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    strictPort: true,
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
  },
});
