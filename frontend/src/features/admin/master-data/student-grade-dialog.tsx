import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { History, ListChecks } from 'lucide-react';
import { CompactDisclosure } from '../../../components/ui/surfaces/compact-disclosure';
import { GRADE_OPTIONS, gradeChangeRequestSchema, todayInBusinessTimeZone, type GradeChangeRequest, type GradeChangePreview, type Student } from '@mumtaz/contracts';
import { Button } from '../../../components/ui/actions/button';
import { Modal } from '../../../components/ui/overlay/dialog';
import { FormField, Input, Dropdown } from '../../../components/ui/forms/field';
import { InlineAlert } from '../../../components/ui/feedback/states';
import { useNotification } from '../../../components/ui/feedback/notification-provider';
import { formatLessonDate, formatRupiah, formatTimestamp } from '../../../lib/format';
import { toApiError } from '../../../lib/api-error';
import { applyGradeChange, fetchGradeHistory, previewGradeChange } from '../api';

export function StudentGradeDialog({student, onClose}: {student:Student; onClose:()=>void}) {
  const client = useQueryClient();
  const notify = useNotification();
  const history = useQuery({queryKey:['admin','student-grade-history',student.id],queryFn:()=>fetchGradeHistory(student.id)});
  const [input,setInput] = useState<GradeChangeRequest>({grade:student.grade as GradeChangeRequest['grade'],effective_from:todayInBusinessTimeZone(),reason:'Kenaikan kelas'});
  const [preview,setPreview] = useState<GradeChangePreview|null>(null);
  const [error,setError] = useState<string|null>(null);
  const review = useMutation({mutationFn:()=>previewGradeChange(student.id,input),onSuccess:setPreview,onError:e=>setError(toApiError(e).message)});
  const save = useMutation({mutationFn:()=>applyGradeChange(student.id,input,preview?.preview_token ?? ''),onSuccess:()=>{
    void client.invalidateQueries();
    notify({status:'success',title:'Riwayat kelas diperbarui'});
    onClose();
  },onError:e=>{setError(toApiError(e).message);setPreview(null);}});
  const busy = review.isPending || save.isPending;
  const patch = (values:Partial<GradeChangeRequest>) => {setInput({...input,...values});setPreview(null);setError(null);};
  return <Modal open onClose={()=>{if(!busy)onClose();}} title="Ubah kelas" description={student.full_name}
    footer={<><Button variant="secondary" disabled={busy} onClick={()=>preview?setPreview(null):onClose()}>{preview?'Kembali':'Batal'}</Button>
      {preview?<Button loading={save.isPending} onClick={()=>save.mutate()}>Simpan perubahan</Button>:<Button type="submit" form="grade-change" loading={review.isPending}>Tinjau perubahan</Button>}</>}>
    {error && <InlineAlert tone="danger" title={error} />}
    {preview ? <div className="space-y-4" aria-live="polite">
      <div className="rounded-md bg-surface-muted p-3">
        <p className="font-medium">{preview.previous_grade} → {preview.new_grade}</p>
        <p className="text-sm text-muted">Mulai {formatLessonDate(input.effective_from)}</p>
        <p className="mt-2 text-sm">{preview.previous_hourly_rate ? formatRupiah(preview.previous_hourly_rate) : 'Belum ada tarif'} → {preview.new_hourly_rate ? formatRupiah(preview.new_hourly_rate) : 'Belum ada tarif'}/jam</p>
      </div>
      {preview.affected_sessions.length ? <>
        <p className="text-sm">{preview.affected_sessions.length} sesi terdampak. Perubahan tagihan <strong>{formatRupiah(preview.billing_delta)}</strong>; honor <strong>{formatRupiah(preview.tutor_net_delta)}</strong>.</p>
        <CompactDisclosure title="Rincian sesi" count={preview.affected_sessions.length} icon={<ListChecks aria-hidden className="size-4" />}>
          <ul className="mt-3 space-y-3">{preview.affected_sessions.map(s=><li key={s.id} className="rounded-md bg-surface-muted p-3">
            <p>{formatLessonDate(s.lesson_date)} · {s.previous_grade} → {s.new_grade}</p>
            <p className="text-muted">Tagihan: {s.old_amount?formatRupiah(s.old_amount):'Belum dihitung'} → {s.new_amount?formatRupiah(s.new_amount):'Belum dihitung'}</p>
            <p className="text-muted">Honor: {s.old_net?formatRupiah(s.old_net):'Belum dihitung'} → {s.new_net?formatRupiah(s.new_net):'Belum dihitung'}</p>
          </li>)}</ul>
        </CompactDisclosure>
      </>:<p className="text-sm text-muted">Belum ada sesi yang terdampak. Tarif mengikuti tanggal les.</p>}
    </div> : <div className="space-y-5">
      <form id="grade-change" className="space-y-4" onSubmit={event=>{event.preventDefault();const result=gradeChangeRequestSchema.safeParse(input);if(!result.success){setError(result.error.issues[0]?.message??'Periksa form');return;}setError(null);review.mutate();}}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="grade-new" label="Kelas baru" required><Dropdown id="grade-new" items={GRADE_OPTIONS.map(grade=>({value:grade,label:grade}))} value={input.grade} onChange={grade=>patch({grade:grade as GradeChangeRequest['grade']})} placeholder="Pilih kelas" /></FormField>
          <FormField id="grade-from" label="Berlaku mulai" required><Input id="grade-from" type="date" value={input.effective_from} onChange={e=>patch({effective_from:e.target.value})} required /></FormField>
        </div>
        <FormField id="grade-reason" label="Catatan" required><Input id="grade-reason" value={input.reason} maxLength={500} onChange={e=>patch({reason:e.target.value})} required /></FormField>
        <p className="text-meta text-muted">Tarif ditentukan dari kelas pada tanggal les.</p>
      </form>
      <div className="space-y-1 border-t border-border pt-2">
        <CompactDisclosure title="Riwayat kelas" count={history.data?.entries.length} icon={<History aria-hidden className="size-4" />}>
          {history.isPending && <p role="status" className="py-3 text-sm text-muted">Memuat riwayat…</p>}
          {history.isError && <div className="py-3"><InlineAlert tone="danger" title="Riwayat belum dapat dimuat" /><Button variant="secondary" size="sm" onClick={()=>void history.refetch()}>Coba lagi</Button></div>}
          <ol className="ms-1.5 border-s border-border">{history.data?.entries.map(entry=><li key={entry.id} className="relative py-2.5 ps-5 text-sm">
            <span aria-hidden className="absolute -start-[3.5px] top-4 size-1.5 rounded-full bg-primary/60 ring-4 ring-surface" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="font-medium">{entry.grade}</span><span className="text-meta text-muted">{entry.effective_from==='0001-01-01'?'Kelas awal':formatLessonDate(entry.effective_from)}</span></div>
            {entry.effective_from>todayInBusinessTimeZone() && <span className="text-meta text-primary">Terjadwal</span>}
            <p className="mt-1 break-words text-meta text-muted">{entry.reason}{entry.changed_by_name?` · ${entry.changed_by_name}`:''}</p>
          </li>)}</ol>
        </CompactDisclosure>
        {!!history.data?.audit.length && <CompactDisclosure title="Aktivitas perubahan" count={history.data.audit.length} icon={<ListChecks aria-hidden className="size-4" />}>
          <ul className="divide-y divide-border/60">{[...history.data.audit].reverse().map(a=><li key={a.id} className="py-2.5">
            <p className="break-words text-sm">{a.reason}</p><p className="mt-1 text-meta text-muted">{a.changed_by_name} · {formatTimestamp(a.created_at)}</p>
          </li>)}</ul>
        </CompactDisclosure>}
      </div>
    </div>}
  </Modal>;
}
