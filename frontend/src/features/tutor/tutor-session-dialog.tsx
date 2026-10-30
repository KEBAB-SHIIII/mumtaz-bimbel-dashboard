import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { reviseAttendanceRequestSchema, type ReviseAttendanceRequest, type TutorSession } from '@mumtaz/contracts';
import { StatusBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { DescriptionList } from '../../components/ui/layout-primitives';
import { toApiError } from '../../lib/api-error';
import { formatDuration, formatLessonDate, formatTimestamp } from '../../lib/format';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../lib/form';
import { queryKeys } from '../../lib/query-keys';
import { useCurrentUser } from '../auth/session';
import { fetchTutorAssignments, reviseAttendance } from './api';
import { ATTENDANCE_SERVER_FIELDS, AttendanceFields, toEditablePayload, type AttendanceFormValues } from './attendance-fields';

const valuesOf = (session: TutorSession): AttendanceFormValues => ({
  assignment_id: session.assignment_id,
  lesson_date: session.lesson_date,
  duration_minutes: String(session.duration_minutes),
  learning_material: session.learning_material,
  learning_notes: session.learning_notes ?? '',
  next_focus: session.next_focus ?? '',
});

/** Form revisi: hanya untuk sesi milik sendiri berstatus `revision_requested` (docs/05 §5.1). */
function RevisionForm({ session, onDone, onCancel }: { session: TutorSession; onDone: () => void; onCancel: () => void }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const assignments = useQuery({ queryKey: queryKeys.tutor.assignments, queryFn: fetchTutorAssignments });
  const form = useForm<AttendanceFormValues>({ defaultValues: valuesOf(session) });

  const mutation = useMutation({
    mutationFn: (payload: ReviseAttendanceRequest) => reviseAttendance(session.id, payload),
    onSuccess: () => {
      // Riwayat, dashboard, dan honor Tutor ikut diperbarui.
      void queryClient.invalidateQueries({ queryKey: ['tutor'] });
      onDone();
    },
    onError: (error) => applyServerErrors(form, error, ATTENDANCE_SERVER_FIELDS),
  });
  const serverError = mutation.isError && !hasFieldErrors(mutation.error, ATTENDANCE_SERVER_FIELDS);
  const onSubmit = form.handleSubmit((values) => {
    const payload = validateWith(form, reviseAttendanceRequestSchema, toEditablePayload(values));
    if (payload) mutation.mutate(payload);
  });

  if (assignments.isPending) return <LoadingState label="Memuat penugasan…" />;
  if (assignments.isError) return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;

  return (
    <form id="revision-form" noValidate className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      {serverError && (
        <div className="md:col-span-2">
          <InlineAlert tone="danger" title="Revisi belum terkirim">{toApiError(mutation.error).message}</InlineAlert>
        </div>
      )}
      <AttendanceFields form={form} assignments={assignments.data} tutorName={user.full_name} idPrefix="revision" />
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={mutation.isPending}>Batal</Button>
        <Button type="submit" loading={mutation.isPending} icon={<Send aria-hidden className="size-4" />}>Kirim revisi</Button>
      </div>
    </form>
  );
}

/**
 * Detail sesi Tutor (docs/15 §3.3): waktu submit/verifikasi dan catatan Admin yang
 * diperlukan untuk revisi. Temuan anomali tidak ditampilkan ke Tutor (data internal Admin).
 */
export function TutorSessionDialog({ session, onClose }: { session: TutorSession | null; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [revised, setRevised] = useState(false);

  const close = () => {
    setEditing(false);
    setRevised(false);
    onClose();
  };

  if (!session) return null;
  const canRevise = session.status === 'revision_requested' && !revised;

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={editing ? 'Revisi sesi' : 'Detail sesi'}
      footer={
        !editing && canRevise ? (
          <Button icon={<PencilLine aria-hidden className="size-4" />} onClick={() => setEditing(true)}>Revisi sesi</Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {revised && (
          <InlineAlert tone="success" title="Revisi terkirim dan menunggu verifikasi ulang">
            Status sesi kembali menunggu verifikasi Admin.
          </InlineAlert>
        )}
        {session.admin_note && !revised && (session.status === 'revision_requested' || session.status === 'rejected') && (
          <InlineAlert tone={session.status === 'rejected' ? 'danger' : 'warning'} title={session.status === 'rejected' ? 'Alasan penolakan' : 'Yang perlu diperbaiki'}>
            {session.admin_note}
          </InlineAlert>
        )}
        {editing ? (
          <RevisionForm
            session={session}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              setRevised(true);
            }}
          />
        ) : (
          <>
            <div>{revised ? <StatusBadge status="pending" /> : <StatusBadge status={session.status} />}</div>
            <DescriptionList
              items={[
                { label: 'Nama murid', value: session.student_name },
                { label: 'Kelas · Sekolah', value: `${session.grade} · ${session.school_name}` },
                { label: 'Mata pelajaran', value: session.subject_name },
                { label: 'Tanggal les', value: formatLessonDate(session.lesson_date) },
                { label: 'Durasi les', value: formatDuration(session.duration_minutes) },
                { label: 'Disubmit', value: formatTimestamp(session.submitted_at) },
                { label: 'Diverifikasi', value: session.reviewed_at ? formatTimestamp(session.reviewed_at) : '—' },
                { label: 'Materi pembelajaran', value: session.learning_material },
                { label: 'Catatan pembelajaran', value: session.learning_notes ?? '—' },
                { label: 'Fokus berikutnya', value: session.next_focus ?? '—' },
              ]}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
