import type { AnomalyFinding, FindingType } from '@mumtaz/contracts';
import { Chip } from '../../../components/ui/data-display/chip';

/**
 * Penjelasan jenis anomali (kolom "Temuan" di Data Absensi & dialog detail Admin).
 * Diselaraskan dengan ke-4 nilai enum `finding_type` di PostgreSQL yang dipetakan dari
 * seluruh aturan bisnis model ML FastAPI:
 * - `suspected_duplicate`: duplikat persis (rejected) maupun duplikat samar beda jam (needs_revision)
 * - `duration_outlier`: durasi di luar rentang normal 30–180 menit (< 30 atau > 180)
 * - `late_start`: jam mulai di luar jam operasional 07:00–21:00 (< 07:00 atau > 21:00)
 * - `unusual_pattern`: jadwal bentrok (tutor/murid/sendiri) atau pola tidak biasa lainnya
 */
export const FINDING_LABEL: Record<FindingType, string> = {
  suspected_duplicate: 'Data duplikat',
  duration_outlier: 'Durasi di luar batas (30–180 menit)',
  late_start: 'Jam mulai di luar jam operasional',
  unusual_pattern: 'Jadwal bentrok / pola tidak biasa',
};

const SEVERITY_LABEL = { low: 'rendah', medium: 'sedang', high: 'tinggi' } as const;

/**
 * Sumber analisis: AI Model atau test double (docs/09 §3). Temuan lama dari provider
 * baseline sebelumnya ikut ditampilkan sebagai AI Model tanpa menyebut vendor.
 */
function providerLabel(finding: AnomalyFinding): string {
  if (!finding.provider) return 'Sumber tidak diketahui';
  if (finding.provider.startsWith('fake')) return 'Hasil uji (fake detector), bukan AI live';
  return finding.provider === 'ml_fastapi' && finding.model
    ? `Klasifikasi AI Model · ${finding.model}`
    : 'Klasifikasi AI Model';
}

/** Temuan aktif (yang lama digantikan revisi Tutor tidak ditampilkan). Hanya untuk dilihat Admin. */
export function FindingList({ findings }: { findings: AnomalyFinding[] }) {
  const active = findings.filter((finding) => finding.review_status !== 'superseded');
  return (
    <section aria-labelledby="findings-heading">
      <h3 id="findings-heading" className="text-sm font-semibold text-text">Temuan anomali</h3>
      <p className="mt-0.5 text-meta text-muted">Dasar label validitas dari AI; Admin dapat mengoreksi label bila keliru.</p>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Tidak ada temuan.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {active.map((finding) => (
            <li key={finding.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant="caption" color="yellow">{FINDING_LABEL[finding.finding_type]}</Chip>
                <span className="text-meta text-muted">Prioritas {SEVERITY_LABEL[finding.severity]}</span>
              </div>
              <p className="mt-2 text-text">{finding.reason}</p>
              {finding.evidence_summary && <p className="mt-1 text-muted">{finding.evidence_summary}</p>}
              <p className="mt-2 text-meta text-muted">{providerLabel(finding)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
