import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { submitAttendanceRequestSchema } from '@mumtaz/contracts';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState, InlineAlert } from '../../components/ui/feedback';
import { Card, PageHeader } from '../../components/ui/layout-primitives';
import { LoadingSwitch, SkeletonForm } from '../../components/ui/skeleton';
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
  TutorNameField,
  toEditablePayload,
  type AttendanceFormValues,
} from '../shared/attendance-fields';

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

  const header = <PageHeader title="Form Absensi" description="Catat sesi les yang sudah berlangsung. Data divalidasi otomatis oleh AI." />;
  if (options.isError && !options.data) {
    return (
      <>
        {header}
        <Card>
          <ErrorState error={options.error} onRetry={() => void options.refetch()} />
        </Card>
      </>
    );
  }
  if (!options.data) {
    return (
      <>
        {header}
        <LoadingSwitch loading skeleton={<Card className="max-w-3xl p-4 sm:p-5"><SkeletonForm fields={6} /></Card>}>
          {() => null}
        </LoadingSwitch>
      </>
    );
  }

  return (
    <>
      {header}

      {savedDate && (
        <InlineAlert tone="success" title="Absensi tersimpan">
          Sesi {formatLessonDate(savedDate)} tercatat dan sedang divalidasi. Hasilnya muncul di Riwayat Mengajar.{' '}
          <Link to="/tutor/riwayat" className="font-medium text-primary hover:underline">Lihat riwayat</Link>
        </InlineAlert>
      )}

      {options.data.students.length === 0 || options.data.subjects.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada murid atau mata pelajaran" description="Hubungi Admin untuk menambahkan data murid dan mata pelajaran di Master Data." />
        </Card>
      ) : (
        <Card className="w-full max-w-3xl">
          <form noValidate className="grid grid-cols-1 gap-x-4 gap-y-5 p-4 sm:p-5 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
            {mutation.isError && !hasFieldErrors(mutation.error, ATTENDANCE_SERVER_FIELDS) && (
              <div className="md:col-span-2">
                <InlineAlert tone="danger" title="Absensi belum tersimpan">{toApiError(mutation.error).message}</InlineAlert>
              </div>
            )}
            <AttendanceFields
              form={form}
              options={options.data}
              tutorField={<TutorNameField idPrefix="attendance" tutorName={user.full_name} />}
              idPrefix="attendance"
            />
            {/* HP: tombol kirim menempel di bawah layar (di atas safe area) agar selalu terjangkau ibu jari. */}
            <div className="-mx-4 -mb-4 flex justify-end border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm max-sm:sticky max-sm:bottom-0 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 md:col-span-2">
              <Button type="submit" loading={mutation.isPending} icon={<Send aria-hidden className="size-4" />} className="max-sm:w-full">
                Kirim absensi
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
