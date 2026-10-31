import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { submitAttendanceRequestSchema } from '@mumtaz/contracts';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { Card, PageHeader } from '../../components/ui/layout-primitives';
import { useCurrentUser } from '../auth/session';
import { toApiError } from '../../lib/api-error';
import { formatLessonDate } from '../../lib/format';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../lib/form';
import { queryKeys } from '../../lib/query-keys';
import { fetchAttendanceOptions, submitAttendance } from './api';
import {
  ATTENDANCE_SERVER_FIELDS,
  AttendanceFields,
  EMPTY_ATTENDANCE_VALUES,
  toEditablePayload,
  type AttendanceFormValues,
} from './attendance-fields';

/**
 * Form Absensi Tutor (docs/15 §3.2). `client_submission_id` dibuat sekali per
 * pengisian dan dipakai ulang saat retry, sehingga tidak terjadi sesi ganda.
 */
export function AttendanceFormPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const options = useQuery({ queryKey: queryKeys.tutor.attendanceOptions, queryFn: fetchAttendanceOptions });
  const form = useForm<AttendanceFormValues>({ defaultValues: EMPTY_ATTENDANCE_VALUES });

  const mutation = useMutation({
    mutationFn: submitAttendance,
    // Sukses hanya ditampilkan setelah server mengonfirmasi penyimpanan (201).
    onSuccess: (_session, variables) => {
      setSavedDate(variables.lesson_date);
      form.reset(EMPTY_ATTENDANCE_VALUES);
      // Pengisian berikutnya adalah submission baru.
      setSubmissionId(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ['tutor'] });
    },
    onError: (error) => applyServerErrors(form, error, ATTENDANCE_SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    setSavedDate(null);
    const payload = validateWith(form, submitAttendanceRequestSchema, {
      client_submission_id: submissionId,
      ...toEditablePayload(values),
    });
    if (payload) mutation.mutate(payload);
  });

  if (options.isPending) return <LoadingState />;
  if (options.isError) return <ErrorState error={options.error} onRetry={() => void options.refetch()} />;

  return (
    <>
      <PageHeader title="Form Absensi" description="Catat sesi les yang sudah berlangsung. Sesi akan diverifikasi Admin." />

      {savedDate && (
        <InlineAlert tone="success" title="Absensi tersimpan dan menunggu verifikasi">
          Sesi {formatLessonDate(savedDate)} tercatat dengan status menunggu verifikasi.{' '}
          <Link to="/tutor/riwayat" className="font-medium text-primary hover:underline">Lihat riwayat</Link>
        </InlineAlert>
      )}

      {options.data.students.length === 0 || options.data.subjects.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada murid atau mata pelajaran" description="Hubungi Admin untuk menambahkan data murid dan mata pelajaran di Master Data." />
        </Card>
      ) : (
        <Card>
          <form noValidate className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
            {mutation.isError && !hasFieldErrors(mutation.error, ATTENDANCE_SERVER_FIELDS) && (
              <div className="md:col-span-2">
                <InlineAlert tone="danger" title="Absensi belum tersimpan">{toApiError(mutation.error).message}</InlineAlert>
              </div>
            )}
            <AttendanceFields form={form} options={options.data} tutorName={user.full_name} idPrefix="attendance" />
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" loading={mutation.isPending} icon={<Send aria-hidden className="size-4" />}>
                Kirim absensi
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
