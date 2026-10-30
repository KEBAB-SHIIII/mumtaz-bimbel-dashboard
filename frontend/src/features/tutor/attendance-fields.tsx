import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { todayInBusinessTimeZone, type TutorAssignmentOption } from '@mumtaz/contracts';
import { FormField, Input, Select, Textarea, describedBy } from '../../components/ui/field';

/** Nilai mentah form HTML (semua string); dikonversi & divalidasi schema kontrak saat submit. */
export interface AttendanceFormValues {
  assignment_id: string;
  lesson_date: string;
  duration_minutes: string;
  learning_material: string;
  learning_notes: string;
  next_focus: string;
}

export const EMPTY_ATTENDANCE_VALUES: AttendanceFormValues = {
  assignment_id: '',
  lesson_date: '',
  duration_minutes: '',
  learning_material: '',
  learning_notes: '',
  next_focus: '',
};

/** Field yang error-nya dari server ditampilkan di dekat input. */
export const ATTENDANCE_SERVER_FIELDS = [
  'assignment_id',
  'lesson_date',
  'duration_minutes',
  'learning_material',
  'learning_notes',
  'next_focus',
] as const;

/** Form → payload field editable (tanpa `client_submission_id`); validasi tetap oleh schema kontrak. */
export function toEditablePayload(values: AttendanceFormValues) {
  return {
    assignment_id: values.assignment_id,
    lesson_date: values.lesson_date,
    duration_minutes: values.duration_minutes === '' ? undefined : Number(values.duration_minutes),
    learning_material: values.learning_material,
    learning_notes: values.learning_notes,
    next_focus: values.next_focus,
  };
}

const HINTS = {
  lesson_date: 'Tanggal sesi berlangsung; tidak boleh di masa depan.',
  duration_minutes: 'Bilangan bulat dalam menit, mis. 90.',
} as const;

interface AttendanceFieldsProps {
  form: UseFormReturn<AttendanceFormValues>;
  /** Hanya penugasan aktif milik tutor login (dari `GET /tutor/me/assignments`). */
  assignments: TutorAssignmentOption[];
  tutorName: string;
  /** Prefix id elemen agar dua form di halaman yang sama tidak bentrok. */
  idPrefix: string;
}

/**
 * Field Form Absensi (docs/15 §3.2), dipakai submit baru & revisi.
 * Nama tutor dari session; kelas/sekolah auto-fill dari penugasan terpilih.
 */
export function AttendanceFields({ form, assignments, tutorName, idPrefix }: AttendanceFieldsProps) {
  const { errors } = form.formState;
  const assignmentId = useWatch({ control: form.control, name: 'assignment_id' });
  const selected = assignments.find((a) => a.assignment_id === assignmentId);
  const id = (name: string) => `${idPrefix}-${name}`;
  const control = (name: keyof AttendanceFormValues, hint?: string) => ({
    id: id(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(id(name), errors[name]?.message, hint),
  });

  return (
    <>
      <FormField id={id('tutor')} label="Nama tutor" required hint="Otomatis dari akun Anda.">
        <Input id={id('tutor')} value={tutorName} readOnly disabled aria-describedby={`${id('tutor')}-hint`} />
      </FormField>

      <FormField id={id('assignment_id')} label="Nama murid & mata pelajaran" required error={errors.assignment_id?.message}>
        <Select {...control('assignment_id')} {...form.register('assignment_id')}>
          <option value="">Pilih murid…</option>
          {assignments.map((a) => (
            <option key={a.assignment_id} value={a.assignment_id}>
              {a.student.full_name} — {a.subject.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField id={id('grade')} label="Kelas" required hint="Otomatis dari Master Data.">
        <Input id={id('grade')} value={selected?.student.grade ?? ''} placeholder="—" readOnly disabled aria-describedby={`${id('grade')}-hint`} />
      </FormField>
      <FormField id={id('school')} label="Asal sekolah" required hint="Otomatis dari Master Data.">
        <Input id={id('school')} value={selected?.student.school_name ?? ''} placeholder="—" readOnly disabled aria-describedby={`${id('school')}-hint`} />
      </FormField>

      <FormField id={id('lesson_date')} label="Tanggal les" required hint={HINTS.lesson_date} error={errors.lesson_date?.message}>
        <Input type="date" max={todayInBusinessTimeZone()} {...control('lesson_date', HINTS.lesson_date)} {...form.register('lesson_date')} />
      </FormField>
      <FormField id={id('duration_minutes')} label="Durasi les (menit)" required hint={HINTS.duration_minutes} error={errors.duration_minutes?.message}>
        <Input type="number" inputMode="numeric" min={1} step={1} {...control('duration_minutes', HINTS.duration_minutes)} {...form.register('duration_minutes')} />
      </FormField>

      <FormField id={id('learning_material')} label="Materi pembelajaran" required className="md:col-span-2" error={errors.learning_material?.message}>
        <Input {...control('learning_material')} {...form.register('learning_material')} />
      </FormField>
      <FormField id={id('learning_notes')} label="Catatan pembelajaran" className="md:col-span-2" error={errors.learning_notes?.message}>
        <Textarea {...control('learning_notes')} {...form.register('learning_notes')} />
      </FormField>
      <FormField id={id('next_focus')} label="Fokus berikutnya" className="md:col-span-2" error={errors.next_focus?.message}>
        <Textarea {...control('next_focus')} {...form.register('next_focus')} />
      </FormField>
    </>
  );
}
