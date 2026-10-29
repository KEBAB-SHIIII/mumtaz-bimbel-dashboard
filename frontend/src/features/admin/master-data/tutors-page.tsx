import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createTutorRequestSchema, updateTutorRequestSchema, type Tutor } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../../components/ui/field';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { createMasterData, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, stripEmpty, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList } from './master-data-shared';

const SERVER_FIELDS = ['username', 'full_name', 'phone'] as const;

interface TutorFormValues {
  full_name: string;
  username: string;
  initial_password: string;
  phone: string;
  is_active: boolean;
  login_active: boolean;
}

function TutorFormDialog({ tutor, open, onClose }: { tutor: Tutor | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = tutor !== null;
  const form = useForm<TutorFormValues>({
    values: {
      full_name: tutor?.full_name ?? '',
      username: tutor?.username ?? '',
      initial_password: '',
      phone: tutor?.phone ?? '',
      is_active: tutor?.is_active ?? true,
      login_active: tutor?.login_active ?? true,
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (body: object) => (isEdit ? updateMasterData('tutors', tutor.id, body) : createMasterData('tutors', body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('tutors') });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    const { initial_password, is_active, login_active, ...rest } = values;
    const payload = isEdit
      ? validateWith(form, updateTutorRequestSchema, { ...stripEmpty(rest), phone: rest.phone || null, is_active, login_active })
      : validateWith(form, createTutorRequestSchema, stripEmpty({ ...rest, initial_password }));
    if (payload) mutation.mutate(payload);
  });

  const field = (name: keyof TutorFormValues) => ({
    id: `tutor-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(`tutor-${name}`, errors[name]?.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Ubah tutor' : 'Tambah tutor'}
      description={isEdit ? undefined : 'Password awal disimpan sebagai hash dan tidak dapat dilihat kembali. Sampaikan ke tutor secara pribadi.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="tutor-form" loading={mutation.isPending}>Simpan</Button>
        </>
      }
    >
      <form id="tutor-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="tutor-full_name" label="Nama lengkap" required error={errors.full_name?.message}>
          <Input {...field('full_name')} {...form.register('full_name')} />
        </FormField>
        <FormField id="tutor-username" label="Username" required hint="Huruf kecil, angka, titik, garis bawah, atau tanda hubung." error={errors.username?.message}>
          <Input autoCapitalize="none" spellCheck={false} {...field('username')} {...form.register('username')} />
        </FormField>
        {!isEdit && (
          <FormField id="tutor-initial_password" label="Password awal" required hint="Minimal 8 karakter." error={errors.initial_password?.message}>
            <Input type="password" autoComplete="new-password" {...field('initial_password')} {...form.register('initial_password')} />
          </FormField>
        )}
        <FormField id="tutor-phone" label="Nomor telepon" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" {...field('phone')} {...form.register('phone')} />
        </FormField>
        {isEdit && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-text">Status</legend>
            <CheckboxField
              id="tutor-is_active"
              label="Profil operasional aktif"
              description="Jika nonaktif, tutor tidak bisa menerima penugasan atau mengirim sesi baru, tetapi histori tetap tersimpan."
              {...form.register('is_active')}
            />
            <CheckboxField
              id="tutor-login_active"
              label="Akses login aktif"
              description="Jika nonaktif, tutor langsung keluar dari semua perangkat dan tidak bisa login."
              {...form.register('login_active')}
            />
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

export function TutorsPage() {
  const { query, page, search, update } = useMasterList('tutors');
  const [editing, setEditing] = useState<Tutor | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const columns: ColumnDef<Tutor, unknown>[] = [
    { accessorKey: 'full_name', header: 'Nama' },
    { accessorKey: 'username', header: 'Username' },
    { id: 'phone', header: 'Kontak', cell: ({ row }) => row.original.phone ?? '—' },
    { id: 'is_active', header: 'Status operasional', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    { id: 'login_active', header: 'Akses login', cell: ({ row }) => <ActiveBadge active={row.original.login_active} activeLabel="Bisa login" inactiveLabel="Diblokir" /> },
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
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama atau username" createLabel="Tambah tutor" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            caption="Daftar tutor"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={<EmptyState title="Belum ada tutor" description={search ? 'Tidak ada tutor yang cocok dengan pencarian.' : 'Tambahkan tutor pertama.'} />}
          />
        )}
      </Card>
      <TutorFormDialog key={editing?.id ?? 'new'} tutor={editing} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
