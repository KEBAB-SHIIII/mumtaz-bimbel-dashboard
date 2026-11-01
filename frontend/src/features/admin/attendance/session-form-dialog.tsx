import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { adminCreateAttendanceRequestSchema, type AdminAttendanceDetail } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/dialog';
import { ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Select, describedBy } from '../../../components/ui/field';
import { toApiError } from '../../../lib/api-error';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../../lib/form';
import { queryKeys } from '../../../lib/query-keys';
import {
  ATTENDANCE_SERVER_FIELDS,
  AttendanceFields,
  EMPTY_ATTENDANCE_VALUES,
  attendanceValuesOf,
  toEditablePayload,
  type AttendanceFormValues,
} from '../../shared/attendance-fields';
import { createAttendance, fetchAdminAttendanceOptions, updateAttendance } from '../api';

/**
 * Tambah / ubah sesi oleh Admin (CRUD penuh, revisi PM). Sesi baru divalidasi AI seperti
 * submit Tutor; perubahan data tidak mengubah label validitas (Admin mengoreksinya di Detail).
 */
export function SessionFormDialog({ session, onClose }: { session: AdminAttendanceDetail | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = session !== null;
  const options = useQuery({ queryKey: queryKeys.admin.attendanceOptions, queryFn: fetchAdminAttendanceOptions });
  const form = useForm<AttendanceFormValues>({ defaultValues: session ? attendanceValuesOf(session) : EMPTY_ATTENDANCE_VALUES });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof adminCreateAttendanceRequestSchema.parse>) =>
      session ? updateAttendance(session.id, payload) : createAttendance(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.admin.attendanceDetail(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, ATTENDANCE_SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = validateWith(form, adminCreateAttendanceRequestSchema, { tutor_id: values.tutor_id, ...toEditablePayload(values) });
    if (payload) mutation.mutate(payload);
  });

  // Tutor nonaktif tetap bisa dipilih saat mengubah sesi lamanya.
  const tutors = options.data?.tutors ?? [];
  const tutorChoices =
    session && !tutors.some((tutor) => tutor.id === session.tutor_id)
      ? [...tutors, { id: session.tutor_id, full_name: `${session.tutor_name} (nonaktif)` }]
      : tutors;

  return (
    <Modal
      open
      onClose={mutation.isPending ? () => undefined : onClose}
      size="lg"
      title={isEdit ? 'Ubah sesi' : 'Tambah sesi'}
      description={isEdit ? 'Koreksi data sesi. Label validitas tidak berubah.' : 'Sesi baru divalidasi otomatis oleh AI.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="session-form" loading={mutation.isPending} disabled={!options.data}>Simpan</Button>
        </>
      }
    >
      {options.isPending ? (
        <LoadingState label="Memuat pilihan tutor, murid, dan mapel…" />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <form id="session-form" noValidate className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
          {mutation.isError && !hasFieldErrors(mutation.error, ATTENDANCE_SERVER_FIELDS) && (
            <div className="md:col-span-2">
              <InlineAlert tone="danger" title="Sesi belum tersimpan">{toApiError(mutation.error).message}</InlineAlert>
            </div>
          )}
          <AttendanceFields
            form={form}
            options={options.data}
            idPrefix="admin-session"
            tutorField={
              <FormField id="admin-session-tutor_id" label="Nama tutor" required error={errors.tutor_id?.message}>
                <Select
                  id="admin-session-tutor_id"
                  aria-invalid={Boolean(errors.tutor_id)}
                  aria-describedby={describedBy('admin-session-tutor_id', errors.tutor_id?.message)}
                  {...form.register('tutor_id')}
                >
                  <option value="">Pilih tutor…</option>
                  {tutorChoices.map((tutor) => (
                    <option key={tutor.id} value={tutor.id}>
                      {tutor.full_name}
                    </option>
                  ))}
                </Select>
              </FormField>
            }
          />
        </form>
      )}
    </Modal>
  );
}
