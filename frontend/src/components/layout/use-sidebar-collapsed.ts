import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mumtaz:sidebar-collapsed';

// Preferensi tampilan saja (bukan credential/sesi), jadi aman di localStorage.
function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // storage diblokir (mode privat/kebijakan browser): pakai default terbuka.
  }
}

/** Status collapse sidebar desktop (240px ↔ 64px), diingat antar kunjungan. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Abaikan: preferensi tetap berlaku selama tab terbuka.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);
  return { collapsed, toggle };
}
