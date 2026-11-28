export interface SubjectStyle {
  /** Kertas catatan tempel (latar + warna selotip `before:`). */
  noteClass: string;
  /** Garis proporsi jumlah sesi. */
  barClass: string;
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
 * Identitas warna mapel untuk portal Orang Tua: nada yang sama di Beranda dan Catatan Belajar.
 * Nama tak dikenal → nada dari hash nama (tetap konsisten antar-render).
 */
export function subjectStyle(name: string): SubjectStyle {
  const key = leadingSubject(name.trim().toLowerCase());
  const tone = TONES[FIXED_TONE[key] ?? hash(key) % TONES.length] ?? TONES[0];
  return { ...tone };
}
