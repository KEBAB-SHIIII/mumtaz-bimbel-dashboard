import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy, KeyRound, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createTutorRequestSchema, updateTutorRequestSchema, type Tutor, type TutorCredentialIssued } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { ConfirmDialog, Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, NoResultsState, InlineAlert } from '../../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../../components/ui/field';
import { LoadingSwitch, SkeletonDataTable } from '../../../components/ui/skeleton';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { createTutor, resetTutorPassword, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, stripEmpty, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList } from './master-data-shared';

const SERVER_FIELDS = ['username', 'full_name', 'phone'] as const;

interface TutorFormValues {
  full_name: string;
  username: string;
  phone: string;
  is_active: boolean;
  login_active: boolean;
}

/** Password sementara hanya ada di state komponen ini, tidak di cache/URL/storage. */
function TemporaryPasswordDialog({ issued, onClose }: { issued: TutorCredentialIssued | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!issued) return null;
  const text = `Username: ${issued.tutor.username}\nPassword: ${issued.temporary_password}`;
  return (
    <Modal
      open
      onClose={onClose}
      title="Akun login tutor"
      description={`Untuk ${issued.tutor.full_name}. Password ini hanya ditampilkan sekali.`}
      footer={<Button onClick={onClose}>Saya sudah menyimpan</Button>}
    >
      <div className="flex flex-col gap-4">
        <InlineAlert tone="warning" title="Salin dan sampaikan sekarang">
          Setelah dialog ditutup password tidak dapat dilihat lagi. Sampaikan ke tutor secara pribadi; tutor dapat menggantinya di menu Profil. Jika lupa, gunakan Reset password.
        </InlineAlert>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Username</dt>
          <dd><code className="font-mono">{issued.tutor.username}</code></dd>
          <dt className="text-muted">Password</dt>
          <dd><code className="rounded-md border border-border bg-surface-muted px-2 py-1 font-mono tracking-wider break-all">{issued.temporary_password}</code></dd>
        </dl>
        <div>
          <Button
            variant="secondary"
            icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}
          >
            {copied ? 'Tersalin' : 'Salin username & password'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TutorFormDialog({ tutor, open, onClose, onIssued }: { tutor: Tutor | null; open: boolean; onClose: () => void; onIssued: (issued: TutorCredentialIssued) => void }) {
  const queryClient = useQueryClient();
  const isEdit = tutor !== null;
  const form = useForm<TutorFormValues>({
    values: {
      full_name: tutor?.full_name ?? '',
      username: tutor?.username ?? '',
      phone: tutor?.phone ?? '',
      is_active: tutor?.is_active ?? true,
      login_active: tutor?.login_active ?? true,
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      if (isEdit) {
        await updateMasterData('tutors', tutor.id, body);
        return null;
      }
      return createTutor(body);
    },
    onSuccess: (issued) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('tutors') });
      onClose();
      // Tutor baru: password acak dari sistem ditampilkan sekali.
      if (issued) onIssued(issued);
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    const { is_active, login_active, ...rest } = values;
    const payload = isEdit
      ? validateWith(form, updateTutorRequestSchema, { ...stripEmpty(rest), phone: rest.phone || null, is_active, login_active })
      : validateWith(form, createTutorRequestSchema, stripEmpty(rest));
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
      description={isEdit ? undefined : 'Password dibuat otomatis oleh sistem dan ditampilkan sekali setelah disimpan.'}
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
        <FormField id="tutor-phone" label="Nomor telepon" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" {...field('phone')} {...form.register('phone')} />
        </FormField>
        {isEdit && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-text">Status</legend>
            <CheckboxField
              id="tutor-is_active"
              label="Profil operasional aktif"
              description="Jika nonaktif, tutor tidak bisa mengirim sesi baru, tetapi histori tetap tersimpan."
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
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState<Tutor | null>(null);
  const [issued, setIssued] = useState<TutorCredentialIssued | null>(null);

  const reset = useMutation({
    mutationFn: (id: string) => resetTutorPassword(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('tutors') });
      setResetting(null);
      setIssued(result);
    },
  });

  const columns: ColumnDef<Tutor, unknown>[] = [
    { accessorKey: 'full_name', header: 'Nama' },
    { accessorKey: 'username', header: 'Username' },
    { id: 'phone', header: 'Kontak', cell: ({ row }) => row.original.phone ?? '—' },
    { id: 'is_active', header: 'Status operasional', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    { id: 'login_active', header: 'Akses login', cell: ({ row }) => <ActiveBadge active={row.original.login_active} activeLabel="Bisa login" inactiveLabel="Diblokir" /> },
    {
      id: 'actions',
      meta: { stickyRight: true },
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah ${row.original.full_name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
            Ubah
          </Button>
          <Button variant="secondary" size="sm" icon={<KeyRound aria-hidden className="size-4" />} aria-label={`Reset password ${row.original.full_name}`} onClick={() => setResetting(row.original)}>
            Reset password
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama atau username" createLabel="Tambah tutor" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingSwitch loading={!query.data} skeleton={<SkeletonDataTable headers={['Nama', 'Username', 'Kontak', 'Status operasional', 'Akses login', '']} />}>
            {() =>
              query.data && (
          <DataTable
            caption="Daftar tutor"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={search ? <NoResultsState query={search} onReset={() => update({ search: '' })} /> : <EmptyState title="Belum ada tutor" description="Tambahkan tutor pertama." />}
          />
              )
            }
          </LoadingSwitch>
        )}
      </Card>
      <TutorFormDialog key={editing?.id ?? 'new'} tutor={editing} open={formOpen} onClose={() => setFormOpen(false)} onIssued={setIssued} />

      <ConfirmDialog
        open={resetting !== null}
        onClose={() => { setResetting(null); reset.reset(); }}
        onConfirm={() => resetting && reset.mutate(resetting.id)}
        title="Reset password?"
        description={`Password lama milik ${resetting?.full_name ?? ''} langsung tidak berlaku dan tutor keluar dari semua perangkat. Password baru ditampilkan sekali.`}
        confirmLabel="Reset password"
        tone="danger"
        loading={reset.isPending}
      >
        {reset.isError ? <InlineAlert tone="danger" title={toApiError(reset.error).message} /> : null}
      </ConfirmDialog>

      <TemporaryPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
