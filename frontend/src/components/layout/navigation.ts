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

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Aktif hanya bila path persis sama (untuk item dashboard/index). */
  end?: boolean;
}

/**
 * Navigasi per role (docs/07 §4, docs/15). Menu role lain tidak pernah dirender;
 * ini bukan kontrol keamanan — backend tetap memeriksa role pada setiap request.
 */
export const NAVIGATION: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/absensi', label: 'Data Absensi', icon: ClipboardList },
    { to: '/admin/penagihan', label: 'Penagihan', icon: ReceiptText },
    { to: '/admin/honor', label: 'Honor Tutor', icon: Wallet },
    { to: '/admin/master-data', label: 'Master Data', icon: Database },
  ],
  tutor: [
    { to: '/tutor', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/tutor/absensi', label: 'Form Absensi', icon: NotebookPen },
    { to: '/tutor/riwayat', label: 'Riwayat Mengajar', icon: History },
    { to: '/tutor/honor', label: 'Honor Saya', icon: Wallet },
    { to: '/tutor/profil', label: 'Profil', icon: UserRound },
  ],
  parent: [
    { to: '/orang-tua-murid', label: 'Progress Anak', icon: LayoutDashboard, end: true },
    { to: '/orang-tua-murid/riwayat', label: 'Riwayat Pembelajaran', icon: BookOpenText },
  ],
};
