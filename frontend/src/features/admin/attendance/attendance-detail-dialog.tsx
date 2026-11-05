import { useNotification } from '../../../components/ui/feedback/notification-provider';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { setValidityRequestSchema, type AdminAttendanceDetail } from '@mumtaz/contracts';
import { ValidityBadge } from '../../../components/ui/data-display/status-badge';
import { Chip } from '../../../components/ui/data-display/chip';
import { Button } from '../../../components/ui/actions/button';
import { Modal } from '../../../components/ui/overlay/dialog';
import { ErrorState, InlineAlert } from '../../../components/ui/feedback/states';
import { FormField, Textarea } from '../../../components/ui/forms/field';
import { DescriptionList } from '../../../components/ui/surfaces/layout-primitives';
import { SessionDetailSkeleton } from '../../../components/ui/feedback/skeleton';
import { toApiError } from '../../../lib/api-error';
import { formatDuration, formatLessonDate, formatLessonTime, formatTimestamp } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminAttendanceDetail, setAttendanceValidity } from '../api';
import { ANALYSIS_POLL_MS } from './analysis-polling';
import { FINDING_LABEL } from './finding-list';

function SessionDetails({ detail }: { detail: AdminAttendanceDetail }) {
  return <div className="space-y-5">
    <ValidityBadge validity={detail.validity} />
    <DescriptionList items={[
      { label: 'Nama tutor', value: detail.tutor_name },
      { label: 'Nama murid', value: detail.student_name },
      { label: 'Kelas · Sekolah', value: `${detail.grade} · ${detail.school_name}` },
      { label: 'Mata pelajaran', value: detail.subject_name },
      { label: 'Tanggal les', value: formatLessonDate(detail.lesson_date) },
      { label: 'Jam les', value: formatLessonTime(detail.start_time, detail.end_time) },
      { label: 'Durasi les', value: formatDuration(detail.duration_minutes) },
    ]} />
    <section aria-label="Pembelajaran">
      <DescriptionList items={[
        { label: 'Materi pembelajaran', value: detail.learning_material },
        { label: 'Catatan pembelajaran', value: detail.learning_notes ?? '—' },
        { label: 'Fokus berikutnya', value: detail.next_focus ?? '—' },
      ]} />
    </section>
    <section aria-label="Waktu pencatatan" className="border-t border-border pt-4">
      <DescriptionList items={[
        { label: 'Disubmit oleh tutor', value: formatTimestamp(detail.submitted_at) },
        { label: !detail.last_review.reviewed_at ? 'Validasi' : detail.last_review.reviewed_by_user_id ? 'Divalidasi oleh admin' : 'Divalidasi otomatis', value: detail.last_review.reviewed_at ? formatTimestamp(detail.last_review.reviewed_at) : 'Belum divalidasi' },
      ]} />
    </section>
  </div>;
}

function FindingsPanel({ detail, onBusy }: { detail: AdminAttendanceDetail; onBusy: (busy: boolean) => void }) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(detail.last_review.admin_note ?? '');
  const [error, setError] = useState('');
  const findings = detail.findings.filter((item) => item.review_status !== 'superseded');
  const requested = detail.validity === 'needs_revision';
  const mutation = useMutation({
    mutationFn: (message: string) => setAttendanceValidity(detail.id, { validity: 'needs_revision', admin_note: message }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.admin.attendanceDetail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['tutor'] });
      setEditing(false);
      notify({ status: 'success', title: 'Permintaan revisi tersimpan', description: 'Pesan tersedia di riwayat tutor.' });
    },
    onSettled: () => onBusy(false),
  });
  return <div className="space-y-4">
    {findings.length === 0 ? <p className="py-6 text-center text-sm text-muted">Tidak ada temuan anomali.</p> : <>
      <ul className="space-y-3">
        {findings.map((finding) => <li key={finding.id} className={`space-y-2 rounded-md border p-3 text-sm ${finding.finding_type === 'suspected_duplicate' ? 'border-danger/25 bg-danger-subtle' : 'border-warning/25 bg-warning-subtle'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`font-medium ${finding.finding_type === 'suspected_duplicate' ? 'text-danger-strong' : 'text-warning-strong'}`}>{FINDING_LABEL[finding.finding_type]}</span>
          </div>
          <p>{finding.reason}</p>
          {finding.evidence_summary && <p className="text-muted"><span className="font-medium">Bukti: </span>{finding.evidence_summary}</p>}
        </li>)}
      </ul>
      {requested && detail.last_review.admin_note && <p className="text-sm text-muted">
        <span className="font-medium">Pesan untuk tutor: </span>{detail.last_review.admin_note}
      </p>}
      {editing ? <form className="space-y-3 rounded-md bg-surface-muted p-3" onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const message = note.trim();
        const parsed = setValidityRequestSchema.safeParse({ validity: 'needs_revision', admin_note: message });
        if (!message || !parsed.success) {
          setError(!message ? 'Tuliskan apa yang perlu diperbaiki tutor.' : 'Pesan terlalu panjang. Maksimal 5.000 karakter.');
          return;
        }
        setError('');
        onBusy(true);
        mutation.mutate(message);
      }}>
        <FormField id="revision-message" label="Pesan untuk tutor" required hint="Jelaskan data yang perlu diperbaiki. Pesan tampil di Riwayat Mengajar tutor.">
          <Textarea id="revision-message" autoFocus rows={3} maxLength={5000} value={note} disabled={mutation.isPending} aria-invalid={!!error} aria-describedby="revision-message-hint revision-message-error" onChange={(event) => { setNote(event.target.value); setError(''); }} />
        </FormField>
        <p id="revision-message-error" role={error ? 'alert' : undefined} className="text-sm text-danger">{error}</p>
        {mutation.isError && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={mutation.isPending} onClick={() => setEditing(false)}>Batal</Button>
          <Button type="submit" loading={mutation.isPending}>Kirim permintaan revisi</Button>
        </div>
      </form> : <div className="space-y-3">
        <p className="text-sm text-muted">Minta tutor memperbaiki atau mengonfirmasi data sesi.</p>
        <Button onClick={() => { mutation.reset(); setEditing(true); }}>{requested ? 'Ubah pesan revisi' : 'Minta revisi'}</Button>
      </div>}
    </>}
  </div>;
}

export function AttendanceDetailDialog({ sessionId, onClose, onEdit, onDelete }: {
  sessionId: string | null;
  onClose: () => void;
  onEdit: (detail: AdminAttendanceDetail) => void;
  onDelete: (detail: AdminAttendanceDetail) => void;
}) {
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [previousId, setPreviousId] = useState(sessionId);
  const [generation, setGeneration] = useState(0);
  if (previousId !== sessionId) {
    setPreviousId(sessionId);
    if (sessionId !== null) { setTab(0); setGeneration(generation + 1); }
  }
  const detail = useQuery({
    queryKey: queryKeys.admin.attendanceDetail(sessionId ?? ''),
    queryFn: () => fetchAdminAttendanceDetail(sessionId ?? ''),
    enabled: sessionId !== null,
    placeholderData: (previous) => sessionId === null ? previous : undefined,
    refetchInterval: (query) => sessionId !== null && query.state.data?.anomaly_analysis_status === 'pending' ? ANALYSIS_POLL_MS : false,
  });
  const data = detail.data;
  const count = data?.findings.filter((item) => item.review_status !== 'superseded').length ?? 0;
  return <Modal open={sessionId !== null} onClose={() => { if (!busy) onClose(); }} size="lg" stableHeight="compact" title="Detail sesi"
    footer={data && tab === 0 ? <>
      <Button variant="ghost" className="text-danger sm:me-auto" disabled={busy} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onDelete(data)}>Hapus</Button>
      <Button variant="secondary" disabled={busy} icon={<PencilLine aria-hidden className="size-4" />} onClick={() => onEdit(data)}>Ubah data</Button>
    </> : undefined}>
    {!data ? detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : <SessionDetailSkeleton /> : (
      <TabGroup selectedIndex={tab} onChange={setTab} key={`${data.id}-${generation}`} className="space-y-4">
        <TabList aria-label="Informasi sesi" className="sticky top-0 z-10 flex gap-1 rounded-md bg-surface-muted p-1">
          {['Detail sesi', 'Temuan anomali'].map((label, index) => <Tab key={label} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-sm px-2 text-sm font-medium text-muted transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none data-selected:bg-surface data-selected:text-text data-selected:shadow-sm">
            {label}{index === 1 && count > 0 && <Chip variant="caption" color="yellow">{count}</Chip>}
          </Tab>)}
        </TabList>
        <TabPanels>
          <TabPanel unmount={false} className="data-selected:animate-fade-up motion-reduce:animate-none"><SessionDetails detail={data} /></TabPanel>
          <TabPanel unmount={false} className="data-selected:animate-fade-up motion-reduce:animate-none"><FindingsPanel detail={data} onBusy={setBusy} /></TabPanel>
        </TabPanels>
      </TabGroup>
    )}
  </Modal>;
}
