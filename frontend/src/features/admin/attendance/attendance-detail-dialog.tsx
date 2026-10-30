import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, PencilLine } from 'lucide-react';
import { useState } from 'react';
import type { AdminAttendanceDetail, SessionDecision, SessionDecisionRequest } from '@mumtaz/contracts';
import { StatusBadge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog, Modal } from '../../../components/ui/dialog';
import { ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Textarea, describedBy } from '../../../components/ui/field';
import { DescriptionList } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { formatDuration, formatLessonDate, formatTimestamp } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { decideAttendance, fetchAdminAttendanceDetail } from '../api';
import { ANALYSIS_POLL_MS } from './analysis-polling';
import { FindingList } from './finding-list';

const DECISIONS: Record<SessionDecision, { title: string; label: string; description: string; tone: 'primary' | 'danger'; noteRequired: boolean }> = {
  approved: {
    title: 'Setujui sesi?',
    label: 'Setujui',
    description: 'Sesi yang disetujui masuk estimasi honor dan Progress Anak. Keputusan ini final pada baseline (O-15).',
    tone: 'primary',
    noteRequired: false,
  },
  revision_requested: {
    title: 'Minta revisi?',
    label: 'Minta revisi',
    description: 'Tutor akan melihat alasan ini dan dapat memperbaiki sesi. Sesi kembali ke antrean setelah direvisi.',
    tone: 'primary',
    noteRequired: true,
  },
  rejected: {
    title: 'Tolak sesi?',
    label: 'Tolak',
    description: 'Sesi yang ditolak tidak masuk honor dan tidak dapat dibuka ulang pada baseline (O-15).',
    tone: 'danger',
    noteRequired: true,
  },
};

function toDecisionRequest(decision: SessionDecision, note: string): SessionDecisionRequest {
  const adminNote = note.trim();
  if (decision === 'approved') return adminNote ? { decision, admin_note: adminNote } : { decision };
  return { decision, admin_note: adminNote };
}

function DetailBody({ detail }: { detail: AdminAttendanceDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <StatusBadge status={detail.status} />
      </div>
      <DescriptionList
        items={[
          { label: 'Nama tutor', value: detail.tutor_name },
          { label: 'Nama murid', value: detail.student_name },
          { label: 'Kelas', value: detail.grade },
          { label: 'Asal sekolah', value: detail.school_name },
          { label: 'Mata pelajaran', value: detail.subject_name },
          { label: 'Tanggal les', value: formatLessonDate(detail.lesson_date) },
          { label: 'Durasi les', value: formatDuration(detail.duration_minutes) },
          { label: 'Disubmit', value: formatTimestamp(detail.submitted_at) },
          { label: 'Materi pembelajaran', value: detail.learning_material },
          { label: 'Catatan pembelajaran', value: detail.learning_notes ?? '—' },
          { label: 'Fokus berikutnya', value: detail.next_focus ?? '—' },
          { label: 'Ditinjau', value: detail.last_review.reviewed_at ? formatTimestamp(detail.last_review.reviewed_at) : '—' },
          { label: 'Catatan Admin (internal)', value: detail.last_review.admin_note ?? '—' },
        ]}
      />
      <FindingList findings={detail.findings} />
    </div>
  );
}

export function AttendanceDetailDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<SessionDecision | null>(null);
  const [note, setNote] = useState('');

  const detail = useQuery({
    queryKey: queryKeys.admin.attendanceDetail(sessionId ?? ''),
    queryFn: () => fetchAdminAttendanceDetail(sessionId ?? ''),
    enabled: sessionId !== null,
    refetchInterval: (query) => (query.state.data?.anomaly_analysis_status === 'pending' ? ANALYSIS_POLL_MS : false),
  });

  const mutation = useMutation({
    mutationFn: (input: { decision: SessionDecision; note: string }) =>
      decideAttendance(sessionId ?? '', toDecisionRequest(input.decision, input.note)),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.admin.attendanceDetail(updated.id), updated);
      // Status berubah → daftar, dashboard, rekap, dan honor ikut diperbarui.
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setDecision(null);
      setNote('');
    },
  });

  const closeConfirm = () => {
    setDecision(null);
    setNote('');
    mutation.reset();
  };

  const config = decision ? DECISIONS[decision] : null;
  const noteMissing = Boolean(config?.noteRequired && note.trim() === '');
  const noteHint = config?.noteRequired ? 'Wajib diisi; ditampilkan ke tutor.' : undefined;
  const noteError = mutation.isError ? toApiError(mutation.error).details.find((d) => d.field === 'admin_note')?.message : undefined;

  return (
    <>
      <Modal
        open={sessionId !== null}
        onClose={onClose}
        size="lg"
        title="Detail sesi"
        footer={
          detail.data?.status === 'pending' ? (
            <>
              <Button variant="secondary" icon={<PencilLine aria-hidden className="size-4" />} onClick={() => setDecision('revision_requested')}>
                Minta revisi
              </Button>
              <Button variant="danger" icon={<CircleX aria-hidden className="size-4" />} onClick={() => setDecision('rejected')}>
                Tolak
              </Button>
              <Button icon={<CircleCheck aria-hidden className="size-4" />} onClick={() => setDecision('approved')}>
                Setujui
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
          <>
            {detail.data.status !== 'pending' && (
              <div className="mb-4">
                <InlineAlert tone="info" title="Sesi sudah diputuskan">
                  Keputusan hanya dapat diberikan untuk sesi berstatus menunggu verifikasi.
                </InlineAlert>
              </div>
            )}
            <DetailBody detail={detail.data} />
          </>
        )}
      </Modal>

      {config && decision && (
        <ConfirmDialog
          open
          onClose={closeConfirm}
          onConfirm={() => mutation.mutate({ decision, note })}
          title={config.title}
          description={config.description}
          confirmLabel={config.label}
          tone={config.tone}
          loading={mutation.isPending}
          confirmDisabled={noteMissing}
        >
          <div className="flex flex-col gap-3">
            {mutation.isError && !noteError && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
            <FormField
              id="admin-note"
              label={config.noteRequired ? 'Alasan' : 'Catatan'}
              required={config.noteRequired}
              {...(noteHint ? { hint: noteHint } : {})}
              error={noteError}
            >
              <Textarea
                id="admin-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-invalid={Boolean(noteError)}
                aria-describedby={describedBy('admin-note', noteError, noteHint)}
              />
            </FormField>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
