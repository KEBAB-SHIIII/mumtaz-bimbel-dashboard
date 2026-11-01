import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { reviseAttendanceRequestSchema, type ReviseAttendanceRequest, type TutorSession } from '@mumtaz/contracts';
import { ApprovalBadge, ValidityBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/dialog';
import { ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { DescriptionList } from '../../components/ui/layout-primitives';
import { toApiError } from '../../lib/api-error';
import { formatDuration, formatLessonDate, formatLessonTime, formatTimestamp } from '../../lib/format';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../lib/form';
import { queryKeys } from '../../lib/query-keys';
import { useCurrentUser } from '../auth/session';
import { fetchAttendanceOptions, reviseAttendance } from './api';
import {
  ATTENDANCE_SERVER_FIELDS,
  AttendanceFields,
  TutorNameField,
  attendanceValuesOf,
  toEditablePayload,
  type AttendanceFormValues,
} from '../shared/attendance-fields';

/** Form revisi: hanya sesi milik sendiri yang Perlu revisi dengan approval menunggu (revisi PM). */
function RevisionForm({ session, onDone, onCancel }: { session: TutorSession; onDone: () => void; onCancel: () => void }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: queryKeys.tutor.attendanceOptions, queryFn: fetchAttendanceOptions });
  const form = useForm<AttendanceFormValues>({ defaultValues: attendanceValuesOf(session) });

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

  if (options.isPending) return <LoadingState label="Memuat pilihan murid…" />;
  if (options.isError) return <ErrorState error={options.error} onRetry={() => void options.refetch()} />;

  return (
    <form id="revision-form" noValidate className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      {serverError && (
        <div className="md:col-span-2">
          <InlineAlert tone="danger" title="Revisi belum terkirim">{toApiError(mutation.error).message}</InlineAlert>
        </div>
      )}
      <AttendanceFields
        form={form}
        options={options.data}
        tutorField={<TutorNameField idPrefix="revision" tutorName={user.full_name} />}
        idPrefix="revision"
      />
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={mutation.isPending}>Batal</Button>
        <Button type="submit" loading={mutation.isPending} icon={<Send aria-hidden className="size-4" />}>Kirim revisi</Button>
      </div>
    </form>
  );
}

/**
 * Detail sesi Tutor (docs/15 §3.3; revisi PM): validitas data + alasannya dan pesan Admin yang
 * diperlukan untuk revisi. Rincian temuan anomali tidak ditampilkan ke Tutor (data internal Admin).
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
          <InlineAlert tone="success" title="Revisi terkirim">
            Data sesi divalidasi ulang otomatis; hasilnya muncul di Riwayat Mengajar.
          </InlineAlert>
        )}
        {!revised && (session.validity_reason || session.admin_note) && (session.status === 'revision_requested' || session.status === 'rejected') && (
          <InlineAlert tone={session.status === 'rejected' ? 'danger' : 'info'} title={session.status === 'rejected' ? 'Alasan penolakan' : 'Yang perlu diperbaiki'}>
            {session.validity_reason && <p>{session.validity_reason}</p>}
            {session.admin_note && <p className="mt-1">Pesan Admin: {session.admin_note}</p>}
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
            <div className="flex flex-wrap items-center gap-2">
              <ValidityBadge validity={revised ? null : session.validity} />
              {!revised && session.approval_status && (
                <span className="inline-flex items-center gap-1 text-meta text-muted">
                  Approval: <ApprovalBadge approval={session.approval_status} />
                </span>
              )}
            </div>
            <DescriptionList
              items={[
                { label: 'Nama murid', value: session.student_name },
                { label: 'Kelas · Sekolah', value: `${session.grade} · ${session.school_name}` },
                { label: 'Mata pelajaran', value: session.subject_name },
                { label: 'Tanggal les', value: formatLessonDate(session.lesson_date) },
                { label: 'Jam les', value: formatLessonTime(session.start_time, session.end_time) },
                { label: 'Durasi les', value: formatDuration(session.duration_minutes) },
                { label: 'Disubmit', value: formatTimestamp(session.submitted_at) },
                { label: 'Divalidasi', value: session.reviewed_at ? formatTimestamp(session.reviewed_at) : '—' },
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
