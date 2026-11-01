import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { PASSWORD_MIN_LENGTH, changePasswordRequestSchema } from '@mumtaz/contracts';
import { Avatar } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { InlineAlert } from '../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../components/ui/field';
import { Card, DescriptionList, PageHeader } from '../../components/ui/layout-primitives';
import { toApiError } from '../../lib/api-error';
import { applyServerErrors, validateWith } from '../../lib/form';
import { changePassword } from '../auth/api';
import { useCurrentUser } from '../auth/session';

interface PasswordFormValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const NEW_PASSWORD_HINT = `Minimal ${PASSWORD_MIN_LENGTH} karakter dan berbeda dari password lama.`;

/**
 * Profil Tutor: data akun read-only (perubahan lewat Admin) + ganti password
 * (`PATCH /tutor/me/password`). Setelah berhasil, session lain dicabut server.
 */
export function TutorProfilePage() {
  const user = useCurrentUser();
  const form = useForm<PasswordFormValues>({ defaultValues: { current_password: '', new_password: '', confirm_password: '' } });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => form.reset(),
    onError: (error) => applyServerErrors(form, error, ['current_password', 'new_password']),
  });

  const onSubmit = form.handleSubmit(({ confirm_password, ...values }) => {
    mutation.reset();
    if (values.new_password !== confirm_password) {
      form.setError('confirm_password', { message: 'Konfirmasi password tidak sama' });
      return;
    }
    const payload = validateWith(form, changePasswordRequestSchema, values);
    if (payload) mutation.mutate(payload);
  });

  const passwordField = (name: keyof PasswordFormValues, autoComplete: string, hint?: string) => (
    <Input
      id={`profile-${name}`}
      type="password"
      autoComplete={autoComplete}
      aria-invalid={Boolean(errors[name])}
      aria-describedby={describedBy(`profile-${name}`, errors[name]?.message, hint)}
      {...form.register(name)}
    />
  );

  return (
    <>
      <PageHeader title="Profil" description="Data akun Anda. Perubahan nama, username, atau kontak dilakukan oleh Admin." />
      <Card title="Data akun" className="w-full max-w-3xl">
        <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-start sm:p-5">
          <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:text-center">
            <Avatar seed={user.id} name={user.full_name} size={72} decorative />
            <div className="min-w-0 sm:hidden">
              <p className="text-card-title break-words text-text">{user.full_name}</p>
              <p className="text-meta text-muted">Tutor</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
          <DescriptionList
            items={[
              { label: 'Nama lengkap', value: user.full_name },
              { label: 'Username', value: user.username ?? '—' },
              { label: 'Kontak', value: user.phone ?? '—' },
            ]}
          />
          </div>
        </div>
      </Card>

      <Card title="Ganti password" description="Sesi di perangkat lain akan dikeluarkan setelah password diganti." className="w-full max-w-3xl">
        <form noValidate className="flex max-w-md flex-col gap-5 p-4 sm:p-5" onSubmit={(event) => void onSubmit(event)}>
          {mutation.isSuccess && (
            <InlineAlert tone="success" title="Password berhasil diganti">
              Sesi di perangkat lain telah dikeluarkan.
            </InlineAlert>
          )}
          {mutation.isError && !toApiError(mutation.error).details.length && (
            <InlineAlert tone="danger" title={toApiError(mutation.error).status === 401 ? 'Password lama tidak sesuai' : toApiError(mutation.error).message} />
          )}
          <FormField id="profile-current_password" label="Password lama" required error={errors.current_password?.message}>
            {passwordField('current_password', 'current-password')}
          </FormField>
          <FormField id="profile-new_password" label="Password baru" required hint={NEW_PASSWORD_HINT} error={errors.new_password?.message}>
            {passwordField('new_password', 'new-password', NEW_PASSWORD_HINT)}
          </FormField>
          <FormField id="profile-confirm_password" label="Konfirmasi password baru" required error={errors.confirm_password?.message}>
            {passwordField('confirm_password', 'new-password')}
          </FormField>
          <div>
            <Button type="submit" loading={mutation.isPending} icon={<KeyRound aria-hidden className="size-4" />}>
              Simpan password
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
