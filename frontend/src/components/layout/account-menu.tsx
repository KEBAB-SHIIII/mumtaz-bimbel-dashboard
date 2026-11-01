import { Menu, MenuButton, MenuItem, MenuItems, MenuSeparator } from '@headlessui/react';
import { LogOut, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import type { Role } from '@mumtaz/contracts';
import { InitialsAvatar } from './initials-avatar';

const MENU_ITEM =
  'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-text data-focus:bg-surface-muted pointer-coarse:h-11';

interface AccountMenuProps {
  fullName: string;
  role: Role;
  roleLabel: string;
  onLogout: () => void;
}

/** Avatar di header: identitas pengguna + pintasan Profil (Tutor) dan Keluar. */
export function AccountMenu({ fullName, role, roleLabel, onLogout }: AccountMenuProps) {
  return (
    <Menu>
      <MenuButton
        aria-label={`Menu akun ${fullName}`}
        className="grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-150 hover:bg-surface data-open:bg-surface pointer-coarse:size-11 motion-reduce:transition-none"
      >
        <InitialsAvatar name={fullName} />
      </MenuButton>
      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 w-64 origin-top-right rounded-lg border border-border bg-surface p-1.5 shadow-md [--anchor-gap:0.5rem] focus:outline-none transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none"
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <InitialsAvatar name={fullName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{fullName}</p>
            <p className="truncate text-meta text-muted">{roleLabel}</p>
          </div>
        </div>
        <MenuSeparator className="my-1 h-px bg-border" />
        {role === 'tutor' && (
          <MenuItem>
            <Link to="/tutor/profil" className={MENU_ITEM}>
              <UserRound aria-hidden className="size-4 text-muted" />
              Profil
            </Link>
          </MenuItem>
        )}
        <MenuItem>
          <button type="button" onClick={onLogout} className={MENU_ITEM}>
            <LogOut aria-hidden className="size-4 text-muted" />
            Keluar
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
