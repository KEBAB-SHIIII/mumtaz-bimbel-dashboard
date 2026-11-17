import { humanizeAiText } from '../../lib/format';

/** Awalan dari layanan AI sudah diwakili judul/label UI, jadi tidak perlu diulang. */
const stripReasonPrefix = (reason: string) => reason.replace(/^Perlu konfirmasi\/revisi:\s*/i, '');

/** Durasi, jam, dan tanggal ditebalkan agar pembaca langsung melihat angka yang bermasalah. */
const FACT_PATTERN =
  /(\([+-]\d+ menit\)|[+-]?\d+ menit|\d{2}[:.]\d{2}(?:\s*[–-]\s*\d{2}[:.]\d{2})?(?: WIB)?|\d{1,2} (?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4})/g;

/**
 * Kalimat dari layanan AI (alasan validitas / temuan) dalam format Indonesia:
 * tanggal & jam dimanusiakan, lalu durasi, jam, dan tanggal ditebalkan.
 */
export function AiText({ text }: { text: string }) {
  return humanizeAiText(stripReasonPrefix(text))
    .split(FACT_PATTERN)
    .map((part, index) => (index % 2 === 1 ? <strong key={index} className="font-semibold text-text">{part}</strong> : part));
}

/** Sumber analisis: AI Model atau test double. Temuan lama dari baseline sebelumnya ikut berlabel AI Model. */
export function aiProviderLabel(provider: string | null, model: string | null): string {
  if (!provider) return 'Sumber tidak diketahui';
  if (provider.startsWith('fake')) return 'Hasil uji (fake detector), bukan AI live';
  return provider === 'ml_fastapi' && model ? `Klasifikasi AI Model · ${model}` : 'Klasifikasi AI Model';
}
