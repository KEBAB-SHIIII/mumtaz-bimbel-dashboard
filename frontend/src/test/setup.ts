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

// Node 25 punya `localStorage` global bawaan yang tidak berfungsi tanpa `--localstorage-file` dan menimpa
// milik jsdom. Ganti dengan Storage in-memory agar preferensi UI (mis. collapse sidebar) bisa diuji.
if (typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
}

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
