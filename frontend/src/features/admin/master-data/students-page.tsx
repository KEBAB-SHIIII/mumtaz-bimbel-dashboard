import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createStudentRequestSchema, updateStudentRequestSchema, type Student } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../../components/ui/field';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { createMasterData, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList } from './master-data-shared';

const SERVER_FIELDS = ['full_name', 'grade', 'school_name'] as const;

interface StudentFormValues {
  full_name: string;
  grade: string;
  school_name: string;
  is_active: boolean;
}

function StudentFormDialog({ student, open, onClose }: { student: Student | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = student !== null;
  const form = useForm<StudentFormValues>({
    values: {
      full_name: student?.full_name ?? '',
      grade: student?.grade ?? '',
      school_name: student?.school_name ?? '',
      is_active: student?.is_active ?? true,
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (body: object) => (isEdit ? updateMasterData('students', student.id, body) : createMasterData('students', body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('students') });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit(({ is_active, ...values }) => {
    const payload = isEdit
      ? validateWith(form, updateStudentRequestSchema, { ...values, is_active })
      : validateWith(form, createStudentRequestSchema, values);
    if (payload) mutation.mutate(payload);
  });

  const field = (name: keyof StudentFormValues) => ({
    id: `student-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(`student-${name}`, errors[name]?.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Ubah siswa' : 'Tambah siswa'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="student-form" loading={mutation.isPending}>Simpan</Button>
        </>
      }
    >
      <form id="student-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="student-full_name" label="Nama lengkap" required error={errors.full_name?.message}>
          <Input {...field('full_name')} {...form.register('full_name')} />
        </FormField>
        <FormField id="student-grade" label="Kelas" required hint="Contoh: 3 SD, 2 SMP." error={errors.grade?.message}>
          <Input {...field('grade')} {...form.register('grade')} />
        </FormField>
        <FormField id="student-school_name" label="Asal sekolah" required error={errors.school_name?.message}>
          <Input {...field('school_name')} {...form.register('school_name')} />
        </FormField>
        {isEdit && (
          <CheckboxField
            id="student-is_active"
            label="Siswa aktif"
            description="Jika nonaktif, siswa tidak bisa diberi penugasan atau sesi baru. Histori dan akses wali ke sesi lama tetap ada."
            {...form.register('is_active')}
          />
        )}
      </form>
    </Modal>
  );
}

export function StudentsPage() {
  const { query, page, search, update } = useMasterList('students');
  const [editing, setEditing] = useState<Student | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const columns: ColumnDef<Student, unknown>[] = [
    { accessorKey: 'full_name', header: 'Nama' },
    { accessorKey: 'grade', header: 'Kelas' },
    { accessorKey: 'school_name', header: 'Asal sekolah' },
    { id: 'is_active', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah ${row.original.full_name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
          Ubah
        </Button>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama atau sekolah" createLabel="Tambah siswa" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            caption="Daftar siswa"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={<EmptyState title="Belum ada siswa" description={search ? 'Tidak ada siswa yang cocok dengan pencarian.' : 'Tambahkan siswa pertama.'} />}
          />
        )}
      </Card>
      <StudentFormDialog key={editing?.id ?? 'new'} student={editing} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
