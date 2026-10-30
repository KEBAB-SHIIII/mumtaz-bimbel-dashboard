import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createTutorRateRequestSchema, updateTutorRateRequestSchema, type TutorRate } from '@mumtaz/contracts';
import { DemoBadge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Modal } from '../../../components/ui/dialog';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../../../components/ui/feedback';
import { FormField, Input, Select, describedBy } from '../../../components/ui/field';
import { Card, DescriptionList } from '../../../components/ui/layout-primitives';
import { toApiError } from '../../../lib/api-error';
import { formatLessonDate, formatRupiah } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { createTutorRate, updateMasterData } from '../api';
import { applyServerErrors, hasFieldErrors, stripEmpty, validateWith } from '../../../lib/form';
import { CheckboxField, MASTER_PAGE_SIZE, MasterToolbar, useMasterList, useMasterOptions } from './master-data-shared';

const AMOUNT_HINT = 'Angka tanpa titik, mis. 75000.';
const SERVER_FIELDS = ['assignment_id', 'rate_amount', 'effective_from', 'effective_to'] as const;

interface RateFormValues {
  assignment_id: string;
  rate_amount: string;
  is_demo_assumption: boolean;
  effective_from: string;
  effective_to: string;
}

function useAssignmentLabels() {
  const assignments = useMasterOptions('tutor-assignments');
  const items = assignments.data?.items ?? [];
  const labelOf = (id: string) => {
    const a = items.find((item) => item.id === id);
    return a ? `${a.tutor_name} – ${a.student_name} (${a.subject_name})` : '—';
  };
  return { items, labelOf };
}

function RateFormDialog({
  rate,
  open,
  onClose,
  onCreated,
}: {
  rate: TutorRate | null;
  open: boolean;
  onClose: () => void;
  /** Jumlah sesi approved tanpa tarif yang kini memakai tarif baru. */
  onCreated: (appliedToApprovedSessions: number) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = rate !== null;
  const { items: assignments, labelOf } = useAssignmentLabels();
  const form = useForm<RateFormValues>({
    values: {
      assignment_id: rate?.assignment_id ?? '',
      rate_amount: rate?.rate_amount ?? '',
      is_demo_assumption: rate?.is_demo_assumption ?? true,
      effective_from: rate?.effective_from ?? '',
      effective_to: rate?.effective_to ?? '',
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      if (isEdit) {
        await updateMasterData('tutor-rates', rate.id, body);
        return null;
      }
      return createTutorRate(body);
    },
    onSuccess: (created) => {
      if (created) {
        onCreated(created.applied_to_approved_sessions);
        // Snapshot sesi bisa berubah → honor & dashboard ikut diperbarui.
        void queryClient.invalidateQueries({ queryKey: ['admin'] });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.masterDataAll('tutor-rates') });
      onClose();
    },
    onError: (error) => applyServerErrors(form, error, SERVER_FIELDS),
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = isEdit
      ? validateWith(form, updateTutorRateRequestSchema, { effective_to: values.effective_to || null })
      : validateWith(form, createTutorRateRequestSchema, {
          ...stripEmpty({ assignment_id: values.assignment_id, rate_amount: values.rate_amount.trim(), effective_from: values.effective_from, effective_to: values.effective_to }),
          rate_type: 'per_session',
          is_demo_assumption: values.is_demo_assumption,
        });
    if (payload) mutation.mutate(payload);
  });

  const effectiveToHint = 'Kosongkan bila masih berlaku.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Tutup periode tarif' : 'Tambah tarif'}
      description={
        isEdit
          ? 'Nominal tarif yang sudah dipakai tidak diubah. Tutup periodenya lalu buat tarif baru agar histori honor tetap konsisten.'
          : 'Tarif per sesi untuk satu penugasan. Tarif resmi UMKM belum ditetapkan.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
          <Button type="submit" form="rate-form" loading={mutation.isPending}>Simpan</Button>
        </>
      }
    >
      <form id="rate-form" noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mutation.isError && !hasFieldErrors(mutation.error, SERVER_FIELDS) && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        {isEdit ? (
          <DescriptionList
            items={[
              { label: 'Penugasan', value: labelOf(rate.assignment_id) },
              { label: 'Tarif per sesi', value: formatRupiah(rate.rate_amount) },
              { label: 'Berlaku mulai', value: formatLessonDate(rate.effective_from) },
            ]}
          />
        ) : (
          <>
            <FormField id="rate-assignment_id" label="Penugasan" required error={errors.assignment_id?.message}>
              <Select id="rate-assignment_id" aria-invalid={Boolean(errors.assignment_id)} aria-describedby={describedBy('rate-assignment_id', errors.assignment_id?.message)} {...form.register('assignment_id')}>
                <option value="">Pilih…</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>{`${a.tutor_name} – ${a.student_name} (${a.subject_name})`}</option>
                ))}
              </Select>
            </FormField>
            <FormField id="rate-rate_amount" label="Tarif per sesi (Rp)" required hint={AMOUNT_HINT} error={errors.rate_amount?.message}>
              <Input id="rate-rate_amount" inputMode="decimal" aria-invalid={Boolean(errors.rate_amount)} aria-describedby={describedBy('rate-rate_amount', errors.rate_amount?.message, AMOUNT_HINT)} {...form.register('rate_amount')} />
            </FormField>
            <FormField id="rate-effective_from" label="Berlaku mulai" required error={errors.effective_from?.message}>
              <Input id="rate-effective_from" type="date" aria-invalid={Boolean(errors.effective_from)} aria-describedby={describedBy('rate-effective_from', errors.effective_from?.message)} {...form.register('effective_from')} />
            </FormField>
            <CheckboxField id="rate-is_demo_assumption" label="Tarif demo" description='Nominal honor dari tarif ini ditandai badge "Tarif demo" (belum tarif resmi UMKM).' {...form.register('is_demo_assumption')} />
          </>
        )}
        <FormField id="rate-effective_to" label="Berlaku sampai" hint={effectiveToHint} error={errors.effective_to?.message}>
          <Input id="rate-effective_to" type="date" aria-invalid={Boolean(errors.effective_to)} aria-describedby={describedBy('rate-effective_to', errors.effective_to?.message, effectiveToHint)} {...form.register('effective_to')} />
        </FormField>
      </form>
    </Modal>
  );
}

export function RatesPage() {
  const { query, page, update } = useMasterList('tutor-rates');
  const { labelOf } = useAssignmentLabels();
  const [editing, setEditing] = useState<TutorRate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const columns: ColumnDef<TutorRate, unknown>[] = [
    { id: 'assignment', header: 'Penugasan', cell: ({ row }) => labelOf(row.original.assignment_id) },
    {
      id: 'amount',
      header: 'Tarif per sesi',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {formatRupiah(row.original.rate_amount)} {row.original.is_demo_assumption && <DemoBadge />}
        </span>
      ),
    },
    {
      id: 'period',
      header: 'Masa berlaku',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatLessonDate(row.original.effective_from)} – {row.original.effective_to ? formatLessonDate(row.original.effective_to) : 'sekarang'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Aksi</span>,
      cell: ({ row }) => (
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Tutup periode tarif ${labelOf(row.original.assignment_id)}`} onClick={() => { setEditing(row.original); setFormOpen(true); }}>
          Tutup periode
        </Button>
      ),
    },
  ];

  return (
    <>
      {appliedCount !== null && (
        <InlineAlert tone="success" title="Tarif disimpan">
          {appliedCount > 0
            ? `${appliedCount} sesi yang sudah disetujui sebelumnya tanpa tarif kini memakai tarif ini dan masuk estimasi honor.`
            : 'Tidak ada sesi disetujui tanpa tarif yang terdampak.'}
        </InlineAlert>
      )}
      <MasterToolbar createLabel="Tambah tarif" onCreate={() => { setEditing(null); setFormOpen(true); }} />
      <Card>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            caption="Daftar tarif honor"
            columns={columns}
            data={query.data.items}
            getRowId={(row) => row.id}
            isFetching={query.isFetching}
            pagination={{ page, pageSize: MASTER_PAGE_SIZE, total: query.data.total, onPageChange: (next) => update({ page: String(next) }, { resetPage: false }) }}
            empty={<EmptyState title="Belum ada tarif" description="Penugasan tanpa tarif tidak diberi nominal honor." />}
          />
        )}
      </Card>
      <RateFormDialog key={editing?.id ?? 'new'} rate={editing} open={formOpen} onClose={() => setFormOpen(false)} onCreated={setAppliedCount} />
    </>
  );
}
