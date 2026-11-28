import { BookHeart, BookOpen, BookOpenText, Calculator, FlaskConical, Languages, PencilLine, type LucideIcon } from 'lucide-react';

export interface SubjectStyle {
  icon: LucideIcon;
  /** Latar kotak ikon / chip (pastel). */
  tileClass: string;
  /** Warna ikon di atas `tileClass`. */
  iconClass: string;
  /** Kertas catatan tempel (latar + warna selotip `before:`). */
  noteClass: string;
  /** Garis proporsi jumlah sesi. */
  barClass: string;
}

/** Ikon mapel umum; dicocokkan pada nama huruf kecil (awalan/isi). */
const ICONS: [RegExp, LucideIcon][] = [
  [/matematika/, Calculator],
  [/bahasa indonesia/, BookOpenText],
  [/bahasa inggris|bahasa arab/, Languages],
  [/mengaji|qur'?an|muroja'?ah|tajwid/, BookHeart],
  [/^(ipa|ipas|fisika|kimia|biologi)\b/, FlaskConical],
  [/calistung/, PencilLine],
];

/** Empat nada palet landing page. Kelas ditulis utuh agar terdeteksi Tailwind. */
const TONES = [
  { tileClass: 'bg-pastel-blue', iconClass: 'text-ink-blue', noteClass: 'bg-pastel-blue before:bg-bar-blue/60', barClass: 'bg-bar-blue' },
  { tileClass: 'bg-pastel-teal', iconClass: 'text-ink-teal', noteClass: 'bg-pastel-teal before:bg-bar-teal/60', barClass: 'bg-bar-teal' },
  { tileClass: 'bg-pastel-amber', iconClass: 'text-ink-amber', noteClass: 'bg-pastel-amber before:bg-bar-amber/60', barClass: 'bg-bar-amber' },
  { tileClass: 'bg-pastel-sky', iconClass: 'text-ink-sky', noteClass: 'bg-pastel-sky before:bg-bar-sky/60', barClass: 'bg-bar-sky' },
] as const;

/** Nada tetap untuk mapel yang paling sering muncul agar berbeda satu sama lain. */
const FIXED_TONE: Record<string, number> = { matematika: 0, 'bahasa indonesia': 1, 'mengaji, tajwid, dan hafalan': 2, 'bahasa inggris': 3 };

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Identitas visual mapel untuk portal Orang Tua: ikon + nada warna yang sama di Beranda dan Catatan Belajar.
 * Nama tak dikenal → ikon buku & nada dari hash nama (tetap konsisten antar-render).
 */
export function subjectStyle(name: string): SubjectStyle {
  const key = name.trim().toLowerCase();
  const icon = ICONS.find(([pattern]) => pattern.test(key))?.[1] ?? BookOpen;
  const tone = TONES[FIXED_TONE[key] ?? hash(key) % TONES.length] ?? TONES[0];
  return { icon, ...tone };
}
