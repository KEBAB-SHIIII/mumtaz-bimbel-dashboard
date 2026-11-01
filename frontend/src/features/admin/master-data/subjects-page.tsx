import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createSubjectRequestSchema, updateSubjectRequestSchema, type Subject } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, NoResultsState } from '../../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../../components/ui/field';
import { LoadingSwitch, SkeletonDataTable } from '../../../components/ui/skeleton';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { createMasterData, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList } from './master-data-shared';

const SERVER_FIELDS = ['name'] as const;

function SubjectFormDialog({ subject, open, onClose }: { subject: Subject | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = subject !== null;
  const form = useForm<{ name: string; is_active: boolean }>({
    values: { name: subject?.name ?? '', is_active: subject?.is_active ?? true },
  });
  const error = form.formState.errors.name?.message;

  const mutation = useMutation({
    mutationFn: (body: object) => (isEdit ? updateMasterData('subjects', subject.id, body) : createMasterData('subjects', body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('subjects') });
      onClose();
    },
    onError: (err) => applyServerErrors(form, err, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = isEdit
      ? validateWith(form, updateSubjectRequestSchema, values)
      : validateWith(form, createSubjectRequestSchema, { name: values.name });
    if (payload) mutation.mutate(payload);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Ubah mata pelajaran' : 'Tambah mata pelajaran'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="subject-form" loading={mutation.isPending}>Simpan</Button>
        </>
      }
    >
      <form id="subject-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="subject-name" label="Nama mata pelajaran" required error={error}>
          <Input id="subject-name" aria-invalid={Boolean(error)} aria-describedby={describedBy('subject-name', error)} {...form.register('name')} />
        </FormField>
        {isEdit && (
          <CheckboxField id="subject-is_active" label="Aktif" description="Jika nonaktif, mapel tidak bisa dipakai untuk penugasan baru." {...form.register('is_active')} />
        )}
      </form>
    </Modal>
  );
}

export function SubjectsPage() {
  const { query, page, search, update } = useMasterList('subjects');
  const [editing, setEditing] = useState<Subject | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const columns: ColumnDef<Subject, unknown>[] = [
    { accessorKey: 'name', header: 'Mata pelajaran' },
    { id: 'is_active', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    {
      id: 'actions',
      meta: { stickyRight: true },
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah ${row.original.name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
          Ubah
        </Button>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama mapel" createLabel="Tambah mapel" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingSwitch loading={!query.data} skeleton={<SkeletonDataTable headers={['Mata pelajaran', 'Status', '']} />}>
            {() =>
              query.data && (
          <DataTable
            caption="Daftar mata pelajaran"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={search ? <NoResultsState query={search} onReset={() => update({ search: '' })} /> : <EmptyState title="Belum ada mata pelajaran" description="Tambahkan mata pelajaran yang diajarkan; tutor memilihnya saat mengisi absensi." />}
          />
              )
            }
          </LoadingSwitch>
        )}
      </Card>
      <SubjectFormDialog key={editing?.id ?? 'new'} subject={editing} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
