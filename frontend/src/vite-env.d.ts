/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hanya konfigurasi browser non-rahasia. Jangan pernah menaruh secret di VITE_*. */
  readonly VITE_API_BASE_URL?: string;
  /** `live` (default) atau `demo` (fake API adapter berlabel data sintetis). */
  readonly VITE_API_MODE?: 'live' | 'demo';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
