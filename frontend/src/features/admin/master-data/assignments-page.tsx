import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createTutorAssignmentRequestSchema, updateTutorAssignmentRequestSchema, type TutorAssignment } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Input, Select, describedBy } from '../../../components/ui/field';
import { Card, DescriptionList } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { formatLessonDate } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { createMasterData, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, stripEmpty, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList, useMasterOptions } from './master-data-shared';

const END_DATE_HINT = 'Kosongkan bila masih berjalan.';
const SERVER_FIELDS = ['tutor_id', 'student_id', 'subject_id', 'start_date', 'end_date'] as const;

interface AssignmentFormValues {
  tutor_id: string;
  student_id: string;
  subject_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

function AssignmentFormDialog({ assignment, open, onClose }: { assignment: TutorAssignment | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = assignment !== null;
  const tutors = useMasterOptions('tutors');
  const students = useMasterOptions('students');
  const subjects = useMasterOptions('subjects');
  const form = useForm<AssignmentFormValues>({
    values: {
      tutor_id: assignment?.tutor_id ?? '',
      student_id: assignment?.student_id ?? '',
      subject_id: assignment?.subject_id ?? '',
      start_date: assignment?.start_date ?? '',
      end_date: assignment?.end_date ?? '',
      is_active: assignment?.is_active ?? true,
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (body: object) =>
      isEdit ? updateMasterData('tutor-assignments', assignment.id, body) : createMasterData('tutor-assignments', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('tutor-assignments') });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit(({ is_active, ...values }) => {
    const payload = isEdit
      ? validateWith(form, updateTutorAssignmentRequestSchema, { end_date: values.end_date || null, is_active })
      : validateWith(form, createTutorAssignmentRequestSchema, stripEmpty(values));
    if (payload) mutation.mutate(payload);
  });

  const select = (name: 'tutor_id' | 'student_id' | 'subject_id', label: string, options: { id: string; label: string; active: boolean }[]) => (
    <FormField id={`assignment-${name}`} label={label} required error={errors[name]?.message}>
      <Select
        id={`assignment-${name}`}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={describedBy(`assignment-${name}`, errors[name]?.message)}
        {...form.register(name)}
      >
        <option value="">Pilih…</option>
        {options.filter((o) => o.active).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </Select>
    </FormField>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Ubah penugasan' : 'Tambah penugasan'}
      description={
        isEdit
          ? 'Tutor, siswa, dan mapel tidak dapat diubah agar histori sesi tetap benar. Jika salah, nonaktifkan lalu buat penugasan baru.'
          : 'Penugasan menentukan pilihan siswa dan mapel pada Form Absensi tutor.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="assignment-form" loading={mutation.isPending}>Simpan</Button>
        </>
      }
    >
      <form id="assignment-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        {isEdit ? (
          <DescriptionList
            items={[
              { label: 'Tutor', value: assignment.tutor_name },
              { label: 'Siswa', value: assignment.student_name },
              { label: 'Mata pelajaran', value: assignment.subject_name },
              { label: 'Mulai', value: formatLessonDate(assignment.start_date) },
            ]}
          />
        ) : (
          <>
            {select('tutor_id', 'Tutor', tutors.data?.items.map((t) => ({ id: t.id, label: t.full_name, active: t.is_active })) ?? [])}
            {select('student_id', 'Siswa', students.data?.items.map((s) => ({ id: s.id, label: `${s.full_name} (${s.grade})`, active: s.is_active })) ?? [])}
            {select('subject_id', 'Mata pelajaran', subjects.data?.items.map((s) => ({ id: s.id, label: s.name, active: s.is_active })) ?? [])}
            <FormField id="assignment-start_date" label="Tanggal mulai" required error={errors.start_date?.message}>
              <Input id="assignment-start_date" type="date" aria-invalid={Boolean(errors.start_date)} aria-describedby={describedBy('assignment-start_date', errors.start_date?.message)} {...form.register('start_date')} />
            </FormField>
          </>
        )}
        <FormField id="assignment-end_date" label="Tanggal berakhir" hint={END_DATE_HINT} error={errors.end_date?.message}>
          <Input id="assignment-end_date" type="date" aria-invalid={Boolean(errors.end_date)} aria-describedby={describedBy('assignment-end_date', errors.end_date?.message, END_DATE_HINT)} {...form.register('end_date')} />
        </FormField>
        {isEdit && (
          <CheckboxField id="assignment-is_active" label="Penugasan aktif" description="Jika nonaktif, penugasan tidak muncul di Form Absensi tutor." {...form.register('is_active')} />
        )}
      </form>
    </Modal>
  );
}

export function AssignmentsPage() {
  const { query, page, search, update } = useMasterList('tutor-assignments');
  const [editing, setEditing] = useState<TutorAssignment | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const columns: ColumnDef<TutorAssignment, unknown>[] = [
    { accessorKey: 'tutor_name', header: 'Tutor' },
    { accessorKey: 'student_name', header: 'Siswa' },
    { accessorKey: 'subject_name', header: 'Mata pelajaran' },
    {
      id: 'period',
      header: 'Masa berlaku',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatLessonDate(row.original.start_date)} – {row.original.end_date ? formatLessonDate(row.original.end_date) : 'sekarang'}
        </span>
      ),
    },
    { id: 'is_active', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah penugasan ${row.original.tutor_name} – ${row.original.student_name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
          Ubah
        </Button>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Tutor, siswa, atau mapel" createLabel="Tambah penugasan" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            caption="Daftar penugasan tutor"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={<EmptyState title="Belum ada penugasan" />}
          />
        )}
      </Card>
      <AssignmentFormDialog key={editing?.id ?? 'new'} assignment={editing} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
