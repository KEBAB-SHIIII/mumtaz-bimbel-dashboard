/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hanya konfigurasi browser non-rahasia. Jangan pernah menaruh secret di VITE_*. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
