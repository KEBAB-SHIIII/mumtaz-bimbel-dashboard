/**
 * `VITE_API_MODE=demo` memasang fake API adapter (data sintetis) alih-alih backend.
 * Default `live`. Mode demo selalu ditandai banner di UI.
 */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_API_MODE === 'demo';
}
