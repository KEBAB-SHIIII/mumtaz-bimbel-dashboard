import type { ReactNode } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import {
  MAX_SUBJECTS_PER_SESSION,
  durationBetween,
  todayInBusinessTimeZone,
  type AttendanceOptions,
} from '@mumtaz/contracts';
import { CheckboxGroupField, FormField, Input, SearchSelect, Textarea, describedBy } from '../../components/ui/field';
import { formatDuration } from '../../lib/format';

/** Nilai mentah form HTML; dikonversi & divalidasi schema kontrak saat submit. */
export interface AttendanceFormValues {
  /** Hanya dipakai form Admin (Tutor diambil dari session). */
  tutor_id: string;
  student_id: string;
  subject_ids: string[];
  lesson_date: string;
  start_time: string;
  end_time: string;
  learning_material: string;
  learning_notes: string;
  next_focus: string;
}

export const EMPTY_ATTENDANCE_VALUES: AttendanceFormValues = {
  tutor_id: '',
  student_id: '',
  subject_ids: [],
  lesson_date: '',
  start_time: '',
  end_time: '',
  learning_material: '',
  learning_notes: '',
  next_focus: '',
};

/** Field yang error-nya dari server ditampilkan di dekat input. */
export const ATTENDANCE_SERVER_FIELDS = [
  'tutor_id',
  'student_id',
  'subject_ids',
  'lesson_date',
  'start_time',
  'end_time',
  'learning_material',
  'learning_notes',
  'next_focus',
] as const;

/** Form → payload field editable (tanpa tutor & `client_submission_id`); validasi tetap oleh schema kontrak. */
export function toEditablePayload(values: AttendanceFormValues) {
  return {
    student_id: values.student_id,
    subject_ids: values.subject_ids,
    lesson_date: values.lesson_date,
    start_time: values.start_time,
    end_time: values.end_time,
    learning_material: values.learning_material,
    learning_notes: values.learning_notes,
    next_focus: values.next_focus,
  };
}

/** Sesi tersimpan → nilai form (revisi Tutor / ubah oleh Admin). */
export function attendanceValuesOf(session: {
  tutor_id: string;
  student_id: string;
  subject_ids: string[];
  lesson_date: string;
  start_time: string | null;
  end_time: string | null;
  learning_material: string;
  learning_notes: string | null;
  next_focus: string | null;
}): AttendanceFormValues {
  return {
    tutor_id: session.tutor_id,
    student_id: session.student_id,
    subject_ids: session.subject_ids,
    lesson_date: session.lesson_date,
    start_time: session.start_time ?? '',
    end_time: session.end_time ?? '',
    learning_material: session.learning_material,
    learning_notes: session.learning_notes ?? '',
    next_focus: session.next_focus ?? '',
  };
}

const HINTS = {
  lesson_date: 'Tanggal sesi berlangsung; tidak boleh di masa depan.',
  subject_ids: `Boleh lebih dari satu (maksimal ${MAX_SUBJECTS_PER_SESSION}); tarif tetap per sesi.`,
  time: 'Format 24 jam, mis. 18:45.',
} as const;

interface AttendanceFieldsProps {
  form: UseFormReturn<AttendanceFormValues>;
  /** Murid & mata pelajaran aktif yang dapat dipilih. */
  options: AttendanceOptions;
  /** Field tutor: nama tutor dari akun (Tutor) atau pilihan tutor (Admin). */
  tutorField: ReactNode;
  /** Prefix id elemen agar dua form di halaman yang sama tidak bentrok. */
  idPrefix: string;
}

/**
 * Field Form Absensi (docs/15 §3.2; revisi PM), dipakai submit baru, revisi Tutor, dan CRUD Admin.
 * Murid & mapel dipilih sendiri; kelas/sekolah auto-fill dari murid; durasi dihitung dari jam.
 */
export function AttendanceFields({ form, options, tutorField, idPrefix }: AttendanceFieldsProps) {
  const { errors } = form.formState;
  const [studentId, startTime, endTime] = useWatch({ control: form.control, name: ['student_id', 'start_time', 'end_time'] });
  const selected = options.students.find((student) => student.id === studentId);
  const duration = startTime && endTime ? durationBetween(startTime, endTime) : null;
  const id = (name: string) => `${idPrefix}-${name}`;
  const control = (name: keyof AttendanceFormValues, hint?: string) => ({
    id: id(name),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(id(name), errors[name]?.message, hint),
  });

  return (
    <>
      {tutorField}

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

      <FormField id={id('grade')} label="Kelas · Asal sekolah" hint="Terisi otomatis setelah memilih murid.">
        <Input
          id={id('grade')}
          value={selected ? `${selected.grade} · ${selected.school_name}` : ''}
          placeholder="—"
          readOnly
          disabled
          aria-describedby={`${id('grade')}-hint`}
        />
      </FormField>

      <Controller
        control={form.control}
        name="subject_ids"
        render={({ field }) => (
          <CheckboxGroupField
            id={id('subject_ids')}
            legend="Mata pelajaran"
            required
            hint={HINTS.subject_ids}
            error={errors.subject_ids?.message}
            options={options.subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
            value={field.value}
            onChange={field.onChange}
            max={MAX_SUBJECTS_PER_SESSION}
            className="md:col-span-2"
          />
        )}
      />

      <FormField id={id('lesson_date')} label="Tanggal les" required hint={HINTS.lesson_date} error={errors.lesson_date?.message}>
        <Input type="date" max={todayInBusinessTimeZone()} {...control('lesson_date', HINTS.lesson_date)} {...form.register('lesson_date')} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id={id('start_time')} label="Jam mulai" required hint={HINTS.time} error={errors.start_time?.message}>
          <Input type="time" {...control('start_time', HINTS.time)} {...form.register('start_time')} />
        </FormField>
        <FormField id={id('end_time')} label="Jam selesai" required error={errors.end_time?.message}>
          <Input type="time" {...control('end_time')} {...form.register('end_time')} />
        </FormField>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm md:col-span-2" aria-live="polite">
        <span className="text-muted">Durasi les (otomatis):</span>
        <span className="font-medium text-text tabular-nums">
          {duration !== null ? formatDuration(duration) : startTime && endTime ? 'Jam selesai harus setelah jam mulai' : '—'}
        </span>
      </div>

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

/** Field nama tutor untuk form Tutor: wajib, terisi otomatis dari akun (revisi PM: bukan opsional). */
export function TutorNameField({ idPrefix, tutorName }: { idPrefix: string; tutorName: string }) {
  const id = `${idPrefix}-tutor`;
  return (
    <FormField id={id} label="Nama tutor" required hint="Otomatis dari akun Anda.">
      <Input id={id} value={tutorName} readOnly aria-readonly aria-describedby={`${id}-hint`} className="bg-surface-muted" />
    </FormField>
  );
}
