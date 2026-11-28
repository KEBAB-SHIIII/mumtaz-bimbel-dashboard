import type { LearningSummaryStatus } from '@mumtaz/contracts';

export interface SubjectStyle {
  /** Kertas catatan tempel (latar + warna selotip `before:`). */
  noteClass: string;
  /** Garis proporsi jumlah sesi. */
  barClass: string;
}

export interface SessionCardStyle {
  /** Latar kertas pastel + garis tepi tipis + warna selotip di atas (`before:`). */
  cardClass: string;
  /** Warna teks aksen (waktu relatif, label Materi, teks badge status). */
  accentTextClass: string;
  /** Warna titik 6px di dalam badge status (`● Berkembang baik`). */
  dotClass: string;
  /** Label status perkembangan dalam Bahasa Indonesia, atau `null` bila belum dibuka. */
  statusLabel: string | null;
}

/** Empat nada palet landing page. Kelas ditulis utuh agar terdeteksi Tailwind. */
const TONES = [
  { noteClass: 'bg-pastel-blue before:bg-bar-blue/60', barClass: 'bg-bar-blue' },
  { noteClass: 'bg-pastel-teal before:bg-bar-teal/60', barClass: 'bg-bar-teal' },
  { noteClass: 'bg-pastel-amber before:bg-bar-amber/60', barClass: 'bg-bar-amber' },
  { noteClass: 'bg-pastel-sky before:bg-bar-sky/60', barClass: 'bg-bar-sky' },
] as const;

/** Nada tetap untuk mapel yang paling sering muncul agar berbeda satu sama lain. */
const FIXED_TONE: Record<string, number> = { matematika: 0, 'bahasa indonesia': 1, 'mengaji, tajwid, dan hafalan': 2, 'bahasa inggris': 3 };

/** Nama mapel bawaan yang memuat koma (lihat `COMMA_SUBJECTS` backend impor). */
const COMMA_NAMES = ['mengaji, tajwid, dan hafalan'];

/** Sesi multi-mapel datang sebagai "A, B" → gaya mengikuti mapel pertama; nama berkoma tetap utuh. */
function leadingSubject(key: string): string {
  return COMMA_NAMES.find((known) => key.startsWith(known)) ?? key.split(', ')[0] ?? key;
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Identitas warna mapel untuk portal Orang Tua (garis warna di Beranda & bar pelajaran).
 * Nama tak dikenal → nada dari hash nama (tetap konsisten antar-render).
 */
export function subjectStyle(name: string): SubjectStyle {
  const key = leadingSubject(name.trim().toLowerCase());
  const tone = TONES[FIXED_TONE[key] ?? hash(key) % TONES.length] ?? TONES[0];
  return { ...tone };
}

/**
 * Empat warna lembut kartu Catatan Belajar sesuai konteks status perkembangan:
 * - `very_good`       → Teal lembut ("Sangat baik")
 * - `good`            → Biru lembut ("Berkembang baik")
 * - `needs_attention` → Amber lembut ("Perlu pendampingan")
 * - belum dibuka      → Kertas krem hangat (netral sebelum ringkasan dibuka)
 */
const SESSION_CARD_THEMES: Record<LearningSummaryStatus | 'pending', SessionCardStyle> = {
  very_good: {
    cardClass: 'bg-pastel-teal border-bar-teal/60 before:bg-bar-teal/85',
    accentTextClass: 'text-ink-teal',
    dotClass: 'bg-ink-teal',
    statusLabel: 'Sangat baik',
  },
  good: {
    cardClass: 'bg-pastel-blue border-bar-blue/60 before:bg-bar-blue/85',
    accentTextClass: 'text-ink-blue',
    dotClass: 'bg-ink-blue',
    statusLabel: 'Berkembang baik',
  },
  needs_attention: {
    cardClass: 'bg-pastel-amber border-bar-amber/70 before:bg-bar-amber/85',
    accentTextClass: 'text-ink-amber',
    dotClass: 'bg-ink-amber',
    statusLabel: 'Perlu pendampingan',
  },
  pending: {
    cardClass: 'bg-pastel-paper border-bar-paper/75 before:bg-bar-paper/90',
    accentTextClass: 'text-ink-paper',
    dotClass: 'bg-ink-paper',
    statusLabel: null,
  },
};

export function sessionCardStyle(status?: LearningSummaryStatus): SessionCardStyle {
  return SESSION_CARD_THEMES[status ?? 'pending'];
}
