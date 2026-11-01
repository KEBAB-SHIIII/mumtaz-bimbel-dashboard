import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Copy, KeyRound, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createParentRequestSchema, updateParentRequestSchema, type Parent, type ParentAccessCodeIssued } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { ConfirmDialog, Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState, NoResultsState } from '../../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../../components/ui/field';
import { LoadingSwitch, SkeletonDataTable } from '../../../components/ui/skeleton';
import { Card } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { createParent, rotateParentAccessCode, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, stripEmpty, validateWith } from '../../../lib/form';
import { ActiveBadge, CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList, useMasterOptions } from './master-data-shared';

const SERVER_FIELDS = ['full_name', 'email', 'student_links'] as const;
const EMAIL_HINT = 'Kontak saja, bukan metode login.';

/** Kode mentah hanya ada di state komponen ini, tidak di cache/URL/storage. */
function AccessCodeDialog({ issued, onClose }: { issued: ParentAccessCodeIssued | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!issued) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="ID Akses Orang Tua"
      description={`Untuk ${issued.parent.full_name}. Kode ini hanya ditampilkan sekali.`}
      footer={<Button onClick={onClose}>Saya sudah menyimpan kode</Button>}
    >
      <div className="flex flex-col gap-4">
        <InlineAlert tone="warning" title="Salin dan simpan sekarang">
          Setelah dialog ditutup kode tidak dapat dilihat lagi. Sampaikan ke wali secara pribadi; jika hilang, rotasi kode.
        </InlineAlert>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-sm tracking-wider break-all">{issued.access_code}</code>
          <Button
            variant="secondary"
            aria-label="Salin kode"
            icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(issued.access_code).then(() => setCopied(true));
            }}
          >
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface ParentFormValues {
  full_name: string;
  email: string;
  is_active: boolean;
  student_ids: string[];
}

function ParentFormDialog({
  parent,
  open,
  onClose,
  onIssued,
}: {
  parent: Parent | null;
  open: boolean;
  onClose: () => void;
  onIssued: (issued: ParentAccessCodeIssued) => void;
}) {
  const queryClient = useQueryClient();
  const students = useMasterOptions('students');
  const isEdit = parent !== null;
  const [pendingPayload, setPendingPayload] = useState<object | null>(null);
  const form = useForm<ParentFormValues>({
    values: {
      full_name: parent?.full_name ?? '',
      email: parent?.email ?? '',
      is_active: parent?.is_active ?? true,
      student_ids: parent?.students.map((s) => s.student_id) ?? [],
    },
  });
  const { errors } = form.formState;

  const relationshipOf = (studentId: string) => parent?.students.find((s) => s.student_id === studentId)?.relationship ?? null;

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      if (isEdit) {
        await updateMasterData('parents', parent.id, body);
        return null;
      }
      return createParent(body);
    },
    onSuccess: (issued) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('parents') });
      setPendingPayload(null);
      onClose();
      if (issued) onIssued(issued);
    },
    onError: (error) => {
      setPendingPayload(null);
      applyServerErrors(form, error, ['full_name', 'email']);
      if (hasFieldErrors(error, ['student_links'])) form.setError('student_ids', { message: 'Siswa tidak valid' });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (values.student_ids.length === 0) {
      form.setError('student_ids', { message: 'Pilih minimal satu siswa' });
      return;
    }
    const student_links = values.student_ids.map((student_id) => ({ student_id, relationship: relationshipOf(student_id) }));
    const payload = isEdit
      ? validateWith(form, updateParentRequestSchema, {
          full_name: values.full_name,
          email: values.email || null,
          is_active: values.is_active,
          student_links,
        })
      : validateWith(form, createParentRequestSchema, { ...stripEmpty({ full_name: values.full_name, email: values.email }), student_links });
    if (!payload) return;

    // Melepas relasi anak langsung mencabut akses progres → konfirmasi dulu (docs/15 §2.5).
    const removed = parent?.students.filter((s) => !values.student_ids.includes(s.student_id)) ?? [];
    if (removed.length > 0) setPendingPayload(payload);
    else mutation.mutate(payload);
  });

  const removedNames = (parent?.students ?? [])
    .filter((s) => !form.getValues('student_ids').includes(s.student_id))
    .map((s) => s.full_name)
    .join(', ');

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? 'Ubah orang tua/wali' : 'Tambah orang tua/wali'}
        description={isEdit ? undefined : 'ID Akses acak akan dibuat otomatis dan ditampilkan sekali setelah disimpan.'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" form="parent-form" loading={mutation.isPending && pendingPayload === null}>Simpan</Button>
          </>
        }
      >
        <form id="parent-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
          {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
          <FormField id="parent-full_name" label="Nama lengkap" required error={errors.full_name?.message}>
            <Input id="parent-full_name" aria-invalid={Boolean(errors.full_name)} aria-describedby={describedBy('parent-full_name', errors.full_name?.message)} {...form.register('full_name')} />
          </FormField>
          <FormField id="parent-email" label="Email" hint={EMAIL_HINT} error={errors.email?.message}>
            <Input id="parent-email" type="email" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('parent-email', errors.email?.message, EMAIL_HINT)} {...form.register('email')} />
          </FormField>
          <fieldset aria-describedby={errors.student_ids ? 'parent-links-error' : undefined}>
            <legend className="text-sm font-medium text-text">
              Anak yang terhubung <span className="font-normal text-muted">(wajib, minimal satu)</span>
            </legend>
            {students.isPending ? (
              <LoadingState label="Memuat siswa…" className="py-4" />
            ) : students.isError ? (
              <ErrorState error={students.error} onRetry={() => void students.refetch()} />
            ) : (
              <div className="mt-2 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {students.data.items.map((student) => (
                  <CheckboxField
                    key={student.id}
                    id={`parent-student-${student.id}`}
                    label={student.full_name}
                    description={`${student.grade} · ${student.school_name}${student.is_active ? '' : ' · nonaktif'}`}
                    value={student.id}
                    {...form.register('student_ids')}
                  />
                ))}
              </div>
            )}
            {errors.student_ids && (
              <p id="parent-links-error" role="alert" className="mt-1 text-meta text-danger">
                {errors.student_ids.message ?? 'Pilih minimal satu siswa'}
              </p>
            )}
          </fieldset>
          {isEdit && (
            <CheckboxField id="parent-is_active" label="Akses login aktif" description="Jika nonaktif, wali langsung keluar dan tidak bisa masuk." {...form.register('is_active')} />
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingPayload !== null}
        onClose={() => setPendingPayload(null)}
        onConfirm={() => pendingPayload && mutation.mutate(pendingPayload)}
        title="Lepas relasi anak?"
        description={`Akses wali ke progres ${removedNames || 'anak yang dilepas'} akan langsung dicabut.`}
        confirmLabel="Ya, simpan perubahan"
        tone="danger"
        loading={mutation.isPending}
      />
    </>
  );
}

export function ParentsPage() {
  const queryClient = useQueryClient();
  const { query, page, search, update } = useMasterList('parents');
  const [editing, setEditing] = useState<Parent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [rotating, setRotating] = useState<Parent | null>(null);
  const [issued, setIssued] = useState<ParentAccessCodeIssued | null>(null);

  const rotate = useMutation({
    mutationFn: (id: string) => rotateParentAccessCode(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('parents') });
      setRotating(null);
      setIssued(result);
    },
  });

  const columns: ColumnDef<Parent, unknown>[] = [
    { accessorKey: 'full_name', header: 'Nama' },
    { id: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
    {
      id: 'students',
      header: 'Anak terhubung',
      cell: ({ row }) => row.original.students.map((s) => `${s.full_name}${s.relationship ? ` (${s.relationship})` : ''}`).join(', ') || '—',
    },
    { id: 'is_active', header: 'Akses login', cell: ({ row }) => <ActiveBadge active={row.original.is_active} /> },
    {
      id: 'actions',
      meta: { stickyRight: true },
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Ubah ${row.original.full_name}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
            Ubah
          </Button>
          <Button variant="secondary" size="sm" icon={<KeyRound aria-hidden className="size-4" />} aria-label={`Rotasi ID akses ${row.original.full_name}`} onClick={() => setRotating(row.original)}>
            Rotasi kode
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <MasterToolbar search={search} onSearch={(value) => update({ search: value })} placeholder="Nama wali" createLabel="Tambah wali" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingSwitch loading={!query.data} skeleton={<SkeletonDataTable headers={['Nama', 'Email', 'Anak terhubung', 'Akses login', '']} />}>
            {() =>
              query.data && (
          <DataTable
            caption="Daftar orang tua/wali"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={search ? <NoResultsState query={search} onReset={() => update({ search: '' })} /> : <EmptyState title="Belum ada orang tua/wali" description="Tambahkan wali lalu hubungkan dengan anaknya untuk membuat ID Akses Orang Tua." />}
          />
              )
            }
          </LoadingSwitch>
        )}
      </Card>

      <ParentFormDialog key={editing?.id ?? 'new'} parent={editing} open={formOpen} onClose={() => setFormOpen(false)} onIssued={setIssued} />

      <ConfirmDialog
        open={rotating !== null}
        onClose={() => { setRotating(null); rotate.reset(); }}
        onConfirm={() => rotating && rotate.mutate(rotating.id)}
        title="Rotasi ID Akses?"
        description={`Kode lama milik ${rotating?.full_name ?? ''} langsung tidak berlaku dan sesi login wali dicabut. Kode baru ditampilkan sekali.`}
        confirmLabel="Rotasi kode"
        tone="danger"
        loading={rotate.isPending}
      >
        {rotate.isError ? <InlineAlert tone="danger" title={toApiError(rotate.error).message} /> : null}
      </ConfirmDialog>

      <AccessCodeDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
