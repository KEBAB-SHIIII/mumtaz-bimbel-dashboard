import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { submitAttendanceRequestSchema, todayInBusinessTimeZone } from '@mumtaz/contracts';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../components/ui/feedback';
import { FormField, Input, Select, Textarea, describedBy } from '../../components/ui/field';
import { Card, PageHeader } from '../../components/ui/layout-primitives';
import { useCurrentUser } from '../auth/session';
import { toApiError } from '../../lib/api-error';
import { formatLessonDate } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../lib/form';
import { fetchTutorAssignments, submitAttendance } from './api';

interface AttendanceFormValues {
  assignment_id: string;
  lesson_date: string;
  duration_minutes: string;
  learning_material: string;
  learning_notes: string;
  next_focus: string;
}

const EMPTY: AttendanceFormValues = {
  assignment_id: '',
  lesson_date: '',
  duration_minutes: '',
  learning_material: '',
  learning_notes: '',
  next_focus: '',
};

const HINTS = {
  lesson_date: 'Tanggal sesi berlangsung; tidak boleh di masa depan.',
  duration_minutes: 'Bilangan bulat dalam menit, mis. 90.',
} as const;

const SERVER_FIELDS = ['assignment_id', 'lesson_date', 'duration_minutes', 'learning_material', 'learning_notes', 'next_focus'] as const;

/**
 * Form Absensi Tutor (docs/15 §3.2). Nama tutor dari session; siswa/mapel dari
 * assignment; kelas/sekolah auto-fill. `client_submission_id` dibuat sekali per
 * pengisian dan dipakai ulang saat retry, sehingga tidak terjadi sesi ganda.
 */
export function AttendanceFormPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const assignments = useQuery({ queryKey: queryKeys.tutor.assignments, queryFn: fetchTutorAssignments });
  const form = useForm<AttendanceFormValues>({ defaultValues: EMPTY });
  const { errors } = form.formState;

  const assignmentId = useWatch({ control: form.control, name: 'assignment_id' });
  const selected = assignments.data?.find((a) => a.assignment_id === assignmentId);
  const today = todayInBusinessTimeZone();

  const mutation = useMutation({
    mutationFn: submitAttendance,
    // Sukses hanya ditampilkan setelah server mengonfirmasi penyimpanan (201).
    onSuccess: (_session, variables) => {
      setSavedDate(variables.lesson_date);
      form.reset(EMPTY);
      // Pengisian berikutnya adalah submission baru.
      setSubmissionId(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ['tutor'] });
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    setSavedDate(null);
    const payload = validateWith(form, submitAttendanceRequestSchema, {
      client_submission_id: submissionId,
      assignment_id: values.assignment_id,
      lesson_date: values.lesson_date,
      duration_minutes: values.duration_minutes === '' ? undefined : Number(values.duration_minutes),
      learning_material: values.learning_material,
      learning_notes: values.learning_notes,
      next_focus: values.next_focus,
    });
    if (payload) mutation.mutate(payload);
  });

  const field = (name: keyof AttendanceFormValues, hint?: string) => ({
    id: `attendance-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(`attendance-${name}`, errors[name]?.message, hint),
  });

  if (assignments.isPending) return <LoadingState />;
  if (assignments.isError) return <ErrorState error={assignments.error} onRetry={() => void assignments.refetch()} />;

  return (
    <>
      <PageHeader title="Form Absensi" description="Catat sesi les yang sudah berlangsung. Sesi akan diverifikasi Admin." />

      {savedDate && (
        <InlineAlert tone="success" title="Absensi tersimpan dan menunggu verifikasi">
          Sesi {formatLessonDate(savedDate)} tercatat dengan status menunggu verifikasi.{' '}
          <Link to="/tutor/riwayat" className="font-medium text-primary hover:underline">Lihat riwayat</Link>
        </InlineAlert>
      )}

      {assignments.data.length === 0 ? (
        <Card>
          <EmptyState title="Belum ada penugasan aktif" description="Hubungi Admin untuk mendapatkan penugasan siswa dan mata pelajaran." />
        </Card>
      ) : (
        <Card>
          <form noValidate className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
            {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && (
              <div className="md:col-span-2">
                <InlineAlert tone="danger" title="Absensi belum tersimpan">{toApiError(mutation.error).message}</InlineAlert>
              </div>
            )}

            <FormField id="attendance-tutor" label="Nama tutor" required hint="Otomatis dari akun Anda.">
              <Input id="attendance-tutor" value={user.full_name} readOnly disabled aria-describedby="attendance-tutor-hint" />
            </FormField>

            <FormField id="attendance-assignment_id" label="Nama murid & mata pelajaran" required error={errors.assignment_id?.message}>
              <Select {...field('assignment_id')} {...form.register('assignment_id')}>
                <option value="">Pilih murid…</option>
                {assignments.data.map((a) => (
                  <option key={a.assignment_id} value={a.assignment_id}>
                    {a.student.full_name} — {a.subject.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="attendance-grade" label="Kelas" required hint="Otomatis dari Master Data.">
              <Input id="attendance-grade" value={selected?.student.grade ?? ''} placeholder="—" readOnly disabled aria-describedby="attendance-grade-hint" />
            </FormField>
            <FormField id="attendance-school" label="Asal sekolah" required hint="Otomatis dari Master Data.">
              <Input id="attendance-school" value={selected?.student.school_name ?? ''} placeholder="—" readOnly disabled aria-describedby="attendance-school-hint" />
            </FormField>

            <FormField id="attendance-lesson_date" label="Tanggal les" required hint={HINTS.lesson_date} error={errors.lesson_date?.message}>
              <Input type="date" max={today} {...field('lesson_date', HINTS.lesson_date)} {...form.register('lesson_date')} />
            </FormField>
            <FormField id="attendance-duration_minutes" label="Durasi les (menit)" required hint={HINTS.duration_minutes} error={errors.duration_minutes?.message}>
              <Input type="number" inputMode="numeric" min={1} step={1} {...field('duration_minutes', HINTS.duration_minutes)} {...form.register('duration_minutes')} />
            </FormField>

            <FormField id="attendance-learning_material" label="Materi pembelajaran" required className="md:col-span-2" error={errors.learning_material?.message}>
              <Input {...field('learning_material')} {...form.register('learning_material')} />
            </FormField>
            <FormField id="attendance-learning_notes" label="Catatan pembelajaran" className="md:col-span-2" error={errors.learning_notes?.message}>
              <Textarea {...field('learning_notes')} {...form.register('learning_notes')} />
            </FormField>
            <FormField id="attendance-next_focus" label="Fokus berikutnya" className="md:col-span-2" error={errors.next_focus?.message}>
              <Textarea {...field('next_focus')} {...form.register('next_focus')} />
            </FormField>

            <div className="flex justify-end md:col-span-2">
              <Button type="submit" loading={mutation.isPending} icon={mutation.isSuccess ? <CircleCheck aria-hidden className="size-4" /> : <Send aria-hidden className="size-4" />}>
                Kirim absensi
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
