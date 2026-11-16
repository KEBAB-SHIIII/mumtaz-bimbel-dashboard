import { StudentGradeDialog } from './student-grade-dialog';
import { formatLessonDate } from '../../../lib/format';
import { useNotification } from '../../../components/ui/feedback/notification-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { GRADE_OPTIONS, createStudentRequestSchema, updateStudentRequestSchema, type Student } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/actions/button';
import { DataTable } from '../../../components/ui/data-display/data-table';
import { Modal } from '../../../components/ui/overlay/dialog';
import { EmptyState, ErrorState, NoResultsState, InlineAlert } from '../../../components/ui/feedback/states';
import { FormField, Input, SearchSelect, describedBy } from '../../../components/ui/forms/field';
import { LoadingSwitch, SkeletonDataTable } from '../../../components/ui/feedback/skeleton';
import { Card } from '../../../components/ui/surfaces/layout-primitives';
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
  const notify = useNotification();
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
      notify({ status: 'success', title: isEdit ? 'Siswa berhasil diperbarui' : 'Siswa berhasil ditambahkan' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('students') });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit(({ is_active, ...values }) => {
    const payload = isEdit
      ? validateWith(form, updateStudentRequestSchema, { full_name:values.full_name, school_name:values.school_name, is_active })
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
        {!isEdit && <FormField id="student-grade" label="Kelas" required hint="Tarif les mengikuti jenjang PAUD–TK, SD 1–3, SD 4–6, SMP, atau SMA." error={errors.grade?.message}>
          <Controller control={form.control} name="grade" render={({field:gradeField})=>(
            <SearchSelect id="student-grade" items={GRADE_OPTIONS.map(grade=>({value:grade,label:grade}))}
              value={gradeField.value} onChange={gradeField.onChange} placeholder="Pilih kelas"
              invalid={Boolean(errors.grade)} describedBy={describedBy('student-grade',errors.grade?.message,'Tarif les mengikuti jenjang PAUD–TK, SD 1–3, SD 4–6, SMP, atau SMA.')} />
          )} />
        </FormField>}
        <FormField id="student-school_name" label="Asal sekolah" required error={errors.school_name?.message}>
          <Input {...field('school_name')} {...form.register('school_name')} />
        </FormField>
        {isEdit && (
          <CheckboxField
            id="student-is_active"
            label="Siswa aktif"
            description="Jika nonaktif, siswa tidak bisa dipilih untuk sesi baru. Histori dan akses wali ke sesi lama tetap ada."
            {...form.register('is_active')}
          />
        )}
      </form>
    </Modal>
  );
}

export function StudentsPage() {
  const { query, page, search, update } = useMasterList('students');
  const [gradeStudent,setGradeStudent] = useState<Student|null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const columns: ColumnDef<Student, unknown>[] = [
    { accessorKey: 'full_name', header: 'Nama' },
    { accessorKey: 'grade', header: 'Kelas', cell:({row})=><div>{row.original.grade}{row.original.scheduled_grade && <p className="text-meta text-muted">{row.original.scheduled_grade.grade} · mulai {formatLessonDate(row.original.scheduled_grade.effective_from)}</p>}</div> },
    { accessorKey: 'school_name', header: 'Asal sekolah' },
    { id: 'is_active', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    {
      id: 'actions',
      meta: { stickyRight: true },
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" aria-label={`Ubah kelas ${row.original.full_name}`} onClick={()=>setGradeStudent(row.original)}>Kelas</Button><Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah ${row.original.full_name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
          Ubah
        </Button></div>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama atau sekolah" createLabel="Tambah siswa" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingSwitch loading={!query.data} skeleton={<SkeletonDataTable headers={['Nama', 'Kelas', 'Asal sekolah', 'Status', '']} />}>
            {() =>
              query.data && (
          <DataTable
            caption="Daftar siswa"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={search ? <NoResultsState query={search} onReset={() => update({ search: '' })} /> : <EmptyState title="Belum ada siswa" description="Tambahkan siswa pertama." />}
          />
              )
            }
          </LoadingSwitch>
        )}
      </Card>
      {gradeStudent && <StudentGradeDialog student={gradeStudent} onClose={()=>setGradeStudent(null)} />}
      <StudentFormDialog key={editing?.id ?? 'new'} student={editing} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
