import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { todayInBusinessTimeZone, type AttendanceOptions } from '@mumtaz/contracts';
import { FormField, Input, SearchSelect, Select, Textarea, describedBy } from '../../components/ui/field';

/** Nilai mentah form HTML (semua string); dikonversi & divalidasi schema kontrak saat submit. */
export interface AttendanceFormValues {
  student_id: string;
  subject_id: string;
  lesson_date: string;
  duration_minutes: string;
  learning_material: string;
  learning_notes: string;
  next_focus: string;
}

export const EMPTY_ATTENDANCE_VALUES: AttendanceFormValues = {
  student_id: '',
  subject_id: '',
  lesson_date: '',
  duration_minutes: '',
  learning_material: '',
  learning_notes: '',
  next_focus: '',
};

/** Field yang error-nya dari server ditampilkan di dekat input. */
export const ATTENDANCE_SERVER_FIELDS = [
  'student_id',
  'subject_id',
  'lesson_date',
  'duration_minutes',
  'learning_material',
  'learning_notes',
  'next_focus',
] as const;

/** Form → payload field editable (tanpa `client_submission_id`); validasi tetap oleh schema kontrak. */
export function toEditablePayload(values: AttendanceFormValues) {
  return {
    student_id: values.student_id,
    subject_id: values.subject_id,
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
  /** Murid & mata pelajaran aktif (dari `GET /tutor/attendance-options`); Tutor memilih sendiri. */
  options: AttendanceOptions;
  tutorName: string;
  /** Prefix id elemen agar dua form di halaman yang sama tidak bentrok. */
  idPrefix: string;
}

/**
 * Field Form Absensi (docs/15 §3.2), dipakai submit baru & revisi.
 * Nama tutor dari session; Tutor memilih murid & mapel sendiri; kelas/sekolah auto-fill dari murid.
 */
export function AttendanceFields({ form, options, tutorName, idPrefix }: AttendanceFieldsProps) {
  const { errors } = form.formState;
  const studentId = useWatch({ control: form.control, name: 'student_id' });
  const selected = options.students.find((student) => student.id === studentId);
  const id = (name: string) => `${idPrefix}-${name}`;
  const control = (name: keyof AttendanceFormValues, hint?: string) => ({
    id: id(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(id(name), errors[name]?.message, hint),
  });

  return (
    <>
      <FormField id={id('tutor')} label="Nama tutor" hint="Otomatis dari akun Anda.">
        <Input id={id('tutor')} value={tutorName} readOnly disabled aria-describedby={`${id('tutor')}-hint`} />
      </FormField>

      <FormField id={id('student_id')} label="Nama murid" required hint="Ketik untuk mencari nama murid." error={errors.student_id?.message}>
        <Controller
          control={form.control}
          name="student_id"
          render={({ field }) => (
            <SearchSelect
              id={id('student_id')}
              items={options.students.map((student) => ({ value: student.id, label: student.full_name, hint: student.grade }))}
              value={field.value}
              onChange={field.onChange}
              placeholder="Pilih murid…"
              invalid={Boolean(errors.student_id)}
              describedBy={describedBy(id('student_id'), errors.student_id?.message, 'Ketik untuk mencari nama murid.')}
            />
          )}
        />
      </FormField>

      <FormField id={id('subject_id')} label="Mata pelajaran" required error={errors.subject_id?.message}>
        <Select {...control('subject_id')} {...form.register('subject_id')}>
          <option value="">Pilih mata pelajaran…</option>
          {options.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField id={id('grade')} label="Kelas" hint="Terisi otomatis setelah memilih murid.">
        <Input id={id('grade')} value={selected?.grade ?? ''} placeholder="—" readOnly disabled aria-describedby={`${id('grade')}-hint`} />
      </FormField>
      <FormField id={id('school')} label="Asal sekolah" hint="Terisi otomatis setelah memilih murid.">
        <Input id={id('school')} value={selected?.school_name ?? ''} placeholder="—" readOnly disabled aria-describedby={`${id('school')}-hint`} />
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
