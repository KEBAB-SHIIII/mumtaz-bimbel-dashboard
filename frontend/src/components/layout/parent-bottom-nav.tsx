import { NavLink, useLocation } from 'react-router';
import { cn } from '../../lib/cn';
import { NAVIGATION } from './navigation';

const ITEMS = NAVIGATION.parent.flatMap((group) => group.items);
/** Label ringkas untuk tab bawah HP (ruang sempit). */
const SHORT_LABEL: Record<string, string> = { 'Catatan Belajar': 'Catatan' };

/**
 * Tab bawah portal Orang Tua di layar < lg (pengganti drawer). Query (`student_id`, `period`) ikut dibawa
 * agar anak & bulan terpilih tidak hilang saat berpindah tab. Keluar akun lewat avatar di header.
 */
export function ParentBottomNav() {
  const { search } = useLocation();
  return (
    <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-2">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={{ pathname: item.to, search }}
              end={item.end ?? false}
              className={({ isActive }) => cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors duration-150 motion-reduce:transition-none',
                isActive ? 'text-primary' : 'text-muted hover:text-text',
              )}
            >
              <item.icon aria-hidden className="size-5" />
              {SHORT_LABEL[item.label] ?? item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
