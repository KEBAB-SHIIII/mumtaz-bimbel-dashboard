import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  sessionValiditySchema,
  type AdminAttendanceDetail,
  type SessionValidity,
  type SetValidityRequest,
} from '@mumtaz/contracts';
import { VALIDITY_LABELS, ValidityBadge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/dialog';
import { ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Select, Textarea } from '../../../components/ui/field';
import { DescriptionList } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { formatDuration, formatLessonDate, formatLessonTime, formatTimestamp } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAdminAttendanceDetail, setAttendanceValidity } from '../api';
import { ANALYSIS_POLL_MS } from './analysis-polling';
import { FindingList } from './finding-list';

export function toValidityRequest(validity: SessionValidity, note: string): SetValidityRequest {
  const adminNote = note.trim() ? { admin_note: note.trim() } : {};
  return { validity, ...adminNote };
}

/** Koreksi label validitas AI (mis. salah label) + pesan untuk tutor. */
function ValidityEditor({ detail }: { detail: AdminAttendanceDetail }) {
  const queryClient = useQueryClient();
  const [validity, setValidity] = useState<SessionValidity>(detail.validity ?? 'valid');
  const [note, setNote] = useState(detail.last_review.admin_note ?? '');
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => setAttendanceValidity(detail.id, toValidityRequest(validity, note)),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.admin.attendanceDetail(updated.id), updated);
      // Status berubah → daftar, dashboard, penagihan, dan honor ikut diperbarui.
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setSaved(true);
    },
  });

  return (
    <section aria-labelledby="validity-heading" className="rounded-md border border-border p-3">
      <h3 id="validity-heading" className="text-sm font-semibold text-text">Koreksi validitas</h3>
      <p className="mt-0.5 text-meta text-muted">Ubah bila label AI keliru atau setelah banding tutor via WA. Hanya sesi Valid masuk rekap gaji. Sesi Perlu revisi harus diperbaiki terlebih dahulu.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField id="validity-select" label="Validitas data" required>
          <Select
            id="validity-select"
            value={validity}
            onChange={(event) => {
              setSaved(false);
              setValidity(sessionValiditySchema.parse(event.target.value));
            }}
          >
            {sessionValiditySchema.options.map((option) => (
              <option key={option} value={option}>{VALIDITY_LABELS[option]}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="validity-note" label="Pesan untuk tutor" hint="Ditampilkan di Riwayat Mengajar tutor." className="sm:col-span-2">
          <Textarea id="validity-note" value={note} onChange={(event) => setNote(event.target.value)} aria-describedby="validity-note-hint" className="min-h-16" />
        </FormField>
      </div>
      {mutation.isError && <div className="mt-3"><InlineAlert tone="danger" title={toApiError(mutation.error).message} /></div>}
      {saved && !mutation.isPending && <p role="status" className="mt-3 text-sm text-success">Validitas tersimpan.</p>}
      <div className="mt-3 flex justify-end">
        <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>Simpan validitas</Button>
      </div>
    </section>
  );
}

function DetailBody({ detail }: { detail: AdminAttendanceDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ValidityBadge validity={detail.validity} />

        </div>
        {detail.validity_reason && <p className="text-sm text-text">{detail.validity_reason}</p>}
        {detail.validity === null && detail.anomaly_analysis_status === 'failed' && (
          <InlineAlert tone="warning" title="Validasi AI gagal">Tetapkan validitas secara manual di bawah.</InlineAlert>
        )}
      </div>
      <DescriptionList
        items={[
          { label: 'Nama tutor', value: detail.tutor_name },
          { label: 'Nama murid', value: detail.student_name },
          { label: 'Kelas · Sekolah', value: `${detail.grade} · ${detail.school_name}` },
          { label: 'Mata pelajaran', value: detail.subject_name },
          { label: 'Tanggal les', value: formatLessonDate(detail.lesson_date) },
          { label: 'Jam les', value: formatLessonTime(detail.start_time, detail.end_time) },
          { label: 'Durasi les', value: formatDuration(detail.duration_minutes) },
          { label: 'Disubmit', value: formatTimestamp(detail.submitted_at) },
          { label: 'Materi pembelajaran', value: detail.learning_material },
          { label: 'Catatan pembelajaran', value: detail.learning_notes ?? '—' },
          { label: 'Fokus berikutnya', value: detail.next_focus ?? '—' },
          { label: 'Divalidasi', value: detail.last_review.reviewed_at ? formatTimestamp(detail.last_review.reviewed_at) : '—' },
        ]}
      />
      <FindingList findings={detail.findings} />
      <ValidityEditor key={detail.id} detail={detail} />
    </div>
  );
}

/** Detail sesi: validitas + penjelasan anomali; aksi Ubah/Hapus diteruskan ke halaman. */
export function AttendanceDetailDialog({
  sessionId,
  onClose,
  onEdit,
  onDelete,
}: {
  sessionId: string | null;
  onClose: () => void;
  onEdit: (detail: AdminAttendanceDetail) => void;
  onDelete: (detail: AdminAttendanceDetail) => void;
}) {
  const detail = useQuery({
    queryKey: queryKeys.admin.attendanceDetail(sessionId ?? ''),
    queryFn: () => fetchAdminAttendanceDetail(sessionId ?? ''),
    enabled: sessionId !== null,
    refetchInterval: (query) => (query.state.data?.anomaly_analysis_status === 'pending' ? ANALYSIS_POLL_MS : false),
  });

  return (
    <Modal
      open={sessionId !== null}
      onClose={onClose}
      size="lg"
      title="Detail sesi"
      footer={
        detail.data ? (
          <>
            <Button variant="danger" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onDelete(detail.data)}>
              Hapus
            </Button>
            <Button variant="secondary" icon={<PencilLine aria-hidden className="size-4" />} onClick={() => onEdit(detail.data)}>
              Ubah data
            </Button>
          </>
        ) : undefined
      }
    >
      {detail.isPending ? (
        <LoadingState />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <DetailBody detail={detail.data} />
      )}
    </Modal>
  );
}
