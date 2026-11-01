import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { apiClient, setCsrfToken } from '../lib/api-client';

// jsdom tidak menyediakan ResizeObserver (dipakai Headless UI & tabel); browser nyata punya.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Halaman di-lazy-load (chunk terpisah); saat banyak test berjalan paralel, memuatnya bisa > 1 detik.
configure({ asyncUtilTimeout: 3_000 });

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  cleanup();
  // Kembalikan client bersama ke kondisi awal: adapter asli dan tanpa token CSRF.
  if (originalAdapter === undefined) delete apiClient.defaults.adapter;
  else apiClient.defaults.adapter = originalAdapter;
  setCsrfToken(null);
});
