import {
  BookOpenText,
  ClipboardList,
  Database,
  History,
  LayoutDashboard,
  NotebookPen,
  ReceiptText,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@mumtaz/contracts';

export interface NavChild {
  to: string;
  label: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Aktif hanya bila path persis sama (untuk item dashboard/index). */
  end?: boolean;
  /** Submenu (docs/design/03-layout.md): dibuka otomatis saat rute aktif berada di dalamnya. */
  children?: NavChild[];
}

export interface NavGroup {
  /** Label grup (UTAMA, OPERASIONAL, …). Tidak ditampilkan bila role hanya punya satu grup. */
  label: string;
  items: NavItem[];
}

/**
 * Navigasi per role, dikelompokkan (docs/design/03-layout.md, docs/15). Menu role lain tidak pernah
 * dirender; ini bukan kontrol keamanan — backend tetap memeriksa role pada setiap request.
 * Label disimpan dalam huruf biasa; huruf kapital label grup diatur lewat CSS.
 */
export const NAVIGATION: Record<Role, NavGroup[]> = {
  admin: [
    { label: 'Utama', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Operasional',
      items: [
        { to: '/admin/absensi', label: 'Data Absensi', icon: ClipboardList },
        { to: '/admin/penagihan', label: 'Penagihan', icon: ReceiptText },
        { to: '/admin/honor', label: 'Honor Tutor', icon: Wallet },
      ],
    },
    {
      label: 'Pengaturan',
      items: [
        {
          to: '/admin/master-data',
          label: 'Master Data',
          icon: Database,
          children: [
            { to: '/admin/master-data/tutor', label: 'Tutor' },
            { to: '/admin/master-data/siswa', label: 'Siswa' },
            { to: '/admin/master-data/orang-tua', label: 'Orang Tua/Wali' },
            { to: '/admin/master-data/mapel', label: 'Mata Pelajaran' },
          ],
        },
      ],
    },
  ],
  tutor: [
    { label: 'Utama', items: [{ to: '/tutor', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      label: 'Mengajar',
      items: [
        { to: '/tutor/absensi', label: 'Form Absensi', icon: NotebookPen },
        { to: '/tutor/riwayat', label: 'Riwayat Mengajar', icon: History },
      ],
    },
    {
      label: 'Akun',
      items: [
        { to: '/tutor/honor', label: 'Honor Saya', icon: Wallet },
        { to: '/tutor/profil', label: 'Profil', icon: UserRound },
      ],
    },
  ],
  parent: [
    {
      label: 'Anak',
      items: [
        { to: '/orang-tua-murid', label: 'Progress Anak', icon: LayoutDashboard, end: true },
        { to: '/orang-tua-murid/riwayat', label: 'Riwayat Pembelajaran', icon: BookOpenText },
      ],
    },
  ],
};

export interface NavDestination {
  to: string;
  label: string;
  /** Konteks tampilan di hasil pencarian, mis. "Pengaturan · Master Data". */
  context: string;
  icon: LucideIcon;
}

/** Semua tujuan navigasi role (termasuk submenu) dalam satu daftar datar, untuk pencarian menu. */
export function listDestinations(role: Role): NavDestination[] {
  return NAVIGATION[role].flatMap((group) =>
    group.items.flatMap((item) => {
      if (!item.children) return [{ to: item.to, label: item.label, context: group.label, icon: item.icon }];
      return item.children.map((child) => ({
        to: child.to,
        label: child.label,
        context: `${group.label} · ${item.label}`,
        icon: item.icon,
      }));
    }),
  );
}
