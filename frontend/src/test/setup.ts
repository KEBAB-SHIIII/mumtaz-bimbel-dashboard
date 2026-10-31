import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { apiClient, setCsrfToken } from '../lib/api-client';

// jsdom tidak menyediakan ResizeObserver (dipakai Headless UI & tabel); browser nyata punya.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const originalAdapter = apiClient.defaults.adapter;

afterEach(() => {
  cleanup();
  // Kembalikan client bersama ke kondisi awal: adapter asli dan tanpa token CSRF.
  if (originalAdapter === undefined) delete apiClient.defaults.adapter;
  else apiClient.defaults.adapter = originalAdapter;
  setCsrfToken(null);
});
