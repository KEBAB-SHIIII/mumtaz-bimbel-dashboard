import type { AnomalyFinding, FindingType } from '@mumtaz/contracts';
import { Badge } from '../../../components/ui/badge';

/** Penjelasan jenis anomali (kolom "Temuan" di Data Absensi). */
export const FINDING_LABEL: Record<FindingType, string> = {
  suspected_duplicate: 'Data duplikat',
  duration_outlier: 'Durasi > 180 menit',
  late_start: 'Mulai di atas 21.00',
  unusual_pattern: 'Pola tidak biasa',
};

const SEVERITY_LABEL = { low: 'rendah', medium: 'sedang', high: 'tinggi' } as const;

/** Sumber analisis dibedakan jelas: AI live vs test double (docs/09 §3). */
function providerLabel(finding: AnomalyFinding): string {
  if (!finding.provider) return 'Sumber tidak diketahui';
  if (finding.provider.startsWith('fake')) return 'Hasil uji (fake detector), bukan AI live';
  if (finding.provider === 'gemini') return `Klasifikasi AI (Gemini${finding.model ? ` · ${finding.model}` : ''})`;
  return finding.provider;
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
                <Badge tone="warning">{FINDING_LABEL[finding.finding_type]}</Badge>
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
