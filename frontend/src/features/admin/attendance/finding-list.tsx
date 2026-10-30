import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { anomalyReviewDecisionSchema, type AnomalyFinding, type AnomalyReviewDecision } from '@mumtaz/contracts';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { InlineAlert } from '../../../components/ui/feedback';
import { FormField, Select, Textarea, describedBy } from '../../../components/ui/field';
import { toApiError } from '../../../lib/api-error';
import { formatTimestamp } from '../../../lib/format';
import { reviewAnomalyFinding } from '../api';

const FINDING_LABEL = {
  suspected_duplicate: 'Dugaan duplikasi',
  duration_outlier: 'Durasi tidak wajar',
  unusual_pattern: 'Pola tidak biasa',
} as const;

const REVIEW_LABEL = {
  pending_review: 'Belum direview',
  confirmed_anomaly: 'Anomali terkonfirmasi',
  false_positive: 'Bukan anomali',
  resolved: 'Selesai',
  superseded: 'Digantikan revisi',
} as const;

const SEVERITY_LABEL = { low: 'rendah', medium: 'sedang', high: 'tinggi' } as const;

/** Sumber analisis dibedakan jelas: AI live vs test double (docs/09 §3). */
function providerLabel(finding: AnomalyFinding): string {
  if (!finding.provider) return 'Sumber tidak diketahui';
  if (finding.provider.startsWith('fake')) return 'Hasil uji (fake detector), bukan AI live';
  if (finding.provider === 'gemini') return `Klasifikasi AI (Gemini${finding.model ? ` · ${finding.model}` : ''})`;
  return finding.provider;
}

function ReviewDialog({ finding, onClose }: { finding: AnomalyFinding; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<AnomalyReviewDecision>('confirmed_anomaly');
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => reviewAnomalyFinding(finding.id, { review_status: decision, review_note: note.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const noteHint = 'Wajib; jelaskan dasar penilaian Anda.';

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
      title="Review temuan anomali"
      description="Hasil review hanya mencatat penilaian temuan. Status sesi tetap diputuskan lewat Setujui / Minta revisi / Tolak."
      confirmLabel="Simpan review"
      loading={mutation.isPending}
      confirmDisabled={note.trim() === ''}
    >
      <div className="flex flex-col gap-3">
        {mutation.isError && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="finding-review-status" label="Hasil review" required>
          <Select id="finding-review-status" value={decision} onChange={(e) => setDecision(anomalyReviewDecisionSchema.parse(e.target.value))}>
            {anomalyReviewDecisionSchema.options.map((option) => (
              <option key={option} value={option}>{REVIEW_LABEL[option]}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="finding-review-note" label="Catatan review" required hint={noteHint}>
          <Textarea id="finding-review-note" value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={describedBy('finding-review-note', undefined, noteHint)} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

/** Daftar temuan anomali pada detail sesi (Admin). Temuan bukan bukti kecurangan. */
export function FindingList({ findings }: { findings: AnomalyFinding[] }) {
  const [reviewing, setReviewing] = useState<AnomalyFinding | null>(null);

  return (
    <section aria-labelledby="findings-heading">
      <h3 id="findings-heading" className="text-sm font-semibold text-text">Temuan anomali</h3>
      <p className="mt-0.5 text-xs text-muted">Indikasi untuk direview, bukan bukti kecurangan; tidak mengubah status sesi atau honor.</p>
      {findings.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Tidak ada temuan.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {findings.map((finding) => (
            <li key={finding.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{FINDING_LABEL[finding.finding_type]}</Badge>
                <Badge tone={finding.review_status === 'pending_review' ? 'info' : 'neutral'}>{REVIEW_LABEL[finding.review_status]}</Badge>
                <span className="text-xs text-muted">Prioritas {SEVERITY_LABEL[finding.severity]}</span>
              </div>
              <p className="mt-2 text-text">{finding.reason}</p>
              {finding.evidence_summary && <p className="mt-1 text-muted">{finding.evidence_summary}</p>}
              <p className="mt-2 text-xs text-muted">{providerLabel(finding)}</p>
              {finding.review_note && finding.review_status !== 'superseded' && (
                <p className="mt-1 text-xs text-muted">
                  Review: {finding.review_note}
                  {finding.reviewed_at ? ` · ${formatTimestamp(finding.reviewed_at)}` : ''}
                </p>
              )}
              {finding.review_status !== 'superseded' && (
                <div className="mt-2">
                  <Button variant="secondary" size="sm" icon={<ClipboardCheck aria-hidden className="size-4" />} onClick={() => setReviewing(finding)}>
                    {finding.review_status === 'pending_review' ? 'Review temuan' : 'Ubah review'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {reviewing && <ReviewDialog finding={reviewing} onClose={() => setReviewing(null)} />}
    </section>
  );
}
