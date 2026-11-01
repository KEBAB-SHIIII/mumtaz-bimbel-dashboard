import { ChevronRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState, type ButtonHTMLAttributes } from 'react';
import { NavLink, useMatch } from 'react-router';
import type { Role } from '@mumtaz/contracts';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/avatar';
import { NAVIGATION, type NavItem } from './navigation';

/** Ikuti --ease-out di tokens.css (Motion butuh nilai numerik). */
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const ITEM_BASE =
  'group/item relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 pointer-coarse:h-11 motion-reduce:transition-none';
/** Forced colors membuang gradien/latar: outline menjaga item aktif tetap terlihat di mode kontras tinggi. */
const ITEM_ACTIVE = 'bg-linear-to-r from-[#B9DDB5]/65 via-[#C7E7AC]/50 to-[#D9ED98]/45 text-[#193923] shadow-sm ring-1 ring-inset ring-[#A9D39F]/60 forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-solid';
const ITEM_IDLE = 'text-muted hover:bg-surface hover:text-text';

/** Tooltip sidebar ciut: nama aksesibel tetap dari label sr-only, jadi tooltip disembunyikan dari AT. */
function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 -translate-y-1/2 rounded-md bg-surface-inverse px-2 py-1 text-meta font-medium whitespace-nowrap text-text-inverse opacity-0 shadow-md transition-opacity duration-150 group-hover/item:opacity-100 group-focus-visible/item:opacity-100 motion-reduce:transition-none"
    >
      {label}
    </span>
  );
}

function ItemLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return collapsed ? (
    <>
      <span className="sr-only">{label}</span>
      <CollapsedTooltip label={label} />
    </>
  ) : (
    <span className="truncate">{label}</span>
  );
}

interface ItemProps {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}

function LeafItem({ item, collapsed, onNavigate }: ItemProps) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      className={({ isActive }) => cn(ITEM_BASE, collapsed && 'justify-center px-0', isActive ? ITEM_ACTIVE : ITEM_IDLE)}
    >
      <item.icon aria-hidden className="size-4.5 shrink-0" />
      <ItemLabel label={item.label} collapsed={collapsed} />
    </NavLink>
  );
}

/** Item bersubmenu (Master Data): tautan induk + tombol chevron terpisah; terbuka otomatis saat rute anak aktif. */
function ParentItem({ item, collapsed, onNavigate }: ItemProps) {
  const inside = Boolean(useMatch({ path: item.to, end: false }));
  const [open, setOpen] = useState(inside);
  const [wasInside, setWasInside] = useState(inside);
  const panelId = useId();

  // Pindah ke rute di dalam submenu (dari tautan mana pun) → buka submenu. Menutup tetap pilihan pengguna.
  if (inside !== wasInside) {
    setWasInside(inside);
    if (inside) setOpen(true);
  }

  const expanded = open && !collapsed;
  const children = item.children ?? [];

  return (
    <>
      <div className="flex items-center gap-0.5">
        <NavLink
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              ITEM_BASE,
              collapsed && 'justify-center px-0',
              // Saat submenu terbuka, sorotan pindah ke anak yang aktif; induk cukup ditebalkan.
              isActive && !expanded ? ITEM_ACTIVE : isActive ? 'text-text hover:bg-surface' : ITEM_IDLE,
            )
          }
        >
          <item.icon aria-hidden className="size-4.5 shrink-0" />
          <ItemLabel label={item.label} collapsed={collapsed} />
        </NavLink>
        {!collapsed && (
          <IconButton
            aria-label={`Submenu ${item.label}`}
            aria-expanded={expanded}
            aria-controls={expanded ? panelId : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 transition-transform duration-200 ease-out motion-reduce:transition-none', expanded && 'rotate-90')}
            />
          </IconButton>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="submenu"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            {/* Garis pandu vertikal sejajar tengah ikon induk (Ref 3). */}
            <ul className="ms-[1.1rem] mt-0.5 flex flex-col gap-0.5 border-s border-border ps-2.5">
              {children.map((child) => (
                <li key={child.to}>
                  <NavLink
                    to={child.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-8 items-center rounded-md px-2.5 text-sm transition-colors duration-150 pointer-coarse:h-11 motion-reduce:transition-none',
                        'before:absolute before:-start-[calc(0.625rem+1.5px)] before:inset-y-1.5 before:w-0.5 before:rounded-full',
                        isActive
                          ? cn(ITEM_ACTIVE, 'font-medium before:bg-primary')
                          : 'text-muted hover:bg-surface hover:text-text',
                      )
                    }
                  >
                    <span className="truncate">{child.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function SidebarNav({ role, collapsed = false, onNavigate }: { role: Role; collapsed?: boolean; onNavigate?: (() => void) | undefined }) {
  const groups = NAVIGATION[role];
  const showLabels = groups.length > 1;
  const baseId = useId();

  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-5 px-3 py-2">
      {groups.map((group, index) => {
        const labelId = `${baseId}-${index}`;
        return (
          <div key={group.label} className={cn(collapsed && index > 0 && 'border-t border-border pt-5')}>
            {showLabels && (
              <p id={labelId} className={cn('px-2.5 pb-1.5 text-group-label text-muted uppercase', collapsed && 'sr-only')}>
                {group.label}
              </p>
            )}
            <ul aria-labelledby={showLabels ? labelId : undefined} className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  {item.children ? (
                    <ParentItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                  ) : (
                    <LeafItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Tombol ikon persegi sidebar; 44px di perangkat sentuh. Nama aksesibel wajib lewat `aria-label`. */
function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return (
    <button
      type="button"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface hover:text-text pointer-coarse:size-11 motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

interface SidebarProps {
  role: Role;
  /** ID internal akun: seed avatar. */
  userId: string;
  fullName: string;
  roleLabel: string;
  onLogout: () => void;
  logoutPending: boolean;
  /** `desktop`: sidebar tetap + tombol ciutkan. `drawer`: di dalam drawer HP/tablet + tombol tutup. */
  variant: 'desktop' | 'drawer';
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

/** Isi sidebar: brand, navigasi berkelompok, identitas pengguna + Keluar (docs/design/03-layout.md). */
export function Sidebar({ role, userId, fullName, variant, collapsed = false, onToggleCollapse, onClose }: SidebarProps) {
  const isCollapsed = variant === 'desktop' && collapsed;
  const onNavigate = variant === 'drawer' ? onClose : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5 px-5', isCollapsed && 'justify-center px-0')}>
        {!isCollapsed && (
          <>
            <p className="min-w-0 flex-1 truncate text-lg font-semibold text-text">Mumtaz Bimbel</p>
          </>
        )}
        {variant === 'desktop' ? (
          <IconButton aria-label={isCollapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'} aria-expanded={!isCollapsed} onClick={onToggleCollapse}>
            {isCollapsed ? <PanelLeftOpen aria-hidden className="size-4.5" /> : <PanelLeftClose aria-hidden className="size-4.5" />}
          </IconButton>
        ) : (
          <IconButton aria-label="Tutup menu" onClick={onClose}>
            <X aria-hidden className="size-5" />
          </IconButton>
        )}
      </div>

      <div className={cn('min-h-0 flex-1', isCollapsed ? 'overflow-visible' : 'overflow-y-auto overscroll-contain')}>
        <SidebarNav role={role} collapsed={isCollapsed} onNavigate={onNavigate} />
      </div>

      <div className={cn('shrink-0 p-3', isCollapsed ? 'flex flex-col items-center gap-2' : 'pt-8')}>
        {isCollapsed ? (
          <Avatar seed={userId} name={fullName} size={32} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-[#A9D39F]/60 bg-linear-to-r from-[#B9DDB5]/65 via-[#C7E7AC]/50 to-[#D9ED98]/45 px-4 pb-4 text-center shadow-sm">
            <div className="-mt-6 flex shrink-0 rounded-full bg-surface p-1 shadow-sm">
              <Avatar seed={userId} name={fullName} size={72} decorative className="size-14" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold break-words text-[#193923]">{fullName}</p>
              {role === 'tutor' && <p className="mt-1 text-xs text-muted">as tutor</p>}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
