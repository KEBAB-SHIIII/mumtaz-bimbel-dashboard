import { useNotification } from '../../components/ui/feedback/notification-provider';
import { PasswordInput } from '../../components/ui/forms/password-input';
import { useNavigate } from 'react-router';
import { queryKeys } from '../../lib/query-keys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { PASSWORD_MIN_LENGTH, changePasswordRequestSchema, type AuthUser } from '@mumtaz/contracts';
import { Avatar } from '../../components/ui/data-display/avatar';
import { Button } from '../../components/ui/actions/button';
import { InlineAlert } from '../../components/ui/feedback/states';
import { FormField, describedBy } from '../../components/ui/forms/field';
import { Card, DescriptionList, PageHeader } from '../../components/ui/surfaces/layout-primitives';
import { toApiError } from '../../lib/api-error';
import { applyServerErrors, validateWith } from '../../lib/form';
import { changePassword } from '../auth/api';
import { useSession } from '../auth/session';

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
  const user = useSession().data;
  // Guard akan mengarahkan ke login; jangan render form dengan identitas kosong.
  return user ? <TutorProfileForm user={user} /> : null;
}

function TutorProfileForm({ user }: { user: AuthUser }) {
  const notify = useNotification();
  const required = Boolean(user.must_change_password);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<PasswordFormValues>({ defaultValues: { current_password: '', new_password: '', confirm_password: '' } });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      form.reset();
      queryClient.setQueryData(queryKeys.me, { ...user, must_change_password: false });
      notify({ status: 'success', title: 'Password berhasil diganti', description: required ? 'Semua menu sekarang dapat digunakan.' : 'Sesi di perangkat lain telah dikeluarkan.' });
      if (required) navigate('/tutor', { replace: true });
    },
    onError: (error) => {
      applyServerErrors(form, error, ['current_password', 'new_password']);
    },
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
    <PasswordInput
      id={`profile-${name}`}
      visibilityLabel={name === 'current_password' ? (required ? 'password saat ini' : 'password lama') : name === 'new_password' ? 'password baru' : 'konfirmasi password baru'}
      autoComplete={autoComplete}
      aria-invalid={Boolean(errors[name])}
      aria-describedby={describedBy(`profile-${name}`, errors[name]?.message, hint)}
      {...form.register(name)}
    />
  );

  const accountCard = (<Card title="Data akun" className="w-full max-w-3xl">
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
      </Card>);

  return (
    <>
      <PageHeader title="Profil" description="Data akun Anda. Perubahan nama, username, atau kontak dilakukan oleh Admin." />
      {required && (
        <InlineAlert tone="warning" title="Ganti password untuk melanjutkan">
          Buat password pribadi terlebih dahulu. Setelah disimpan, Dashboard dan menu lainnya dapat digunakan.
        </InlineAlert>
      )}
      {!required && accountCard}

      <Card title="Ganti password" description="Sesi di perangkat lain akan dikeluarkan setelah password diganti." className="w-full max-w-3xl">
        <form noValidate className="flex max-w-md flex-col gap-5 p-4 sm:p-5" onSubmit={(event) => void onSubmit(event)}>
          {mutation.isError && !toApiError(mutation.error).details.length && (
            <InlineAlert tone="danger" title={toApiError(mutation.error).message} />
          )}
          <FormField id="profile-current_password" label={required ? "Password saat ini" : "Password lama"} hint={required ? "Masukkan password yang Anda gunakan untuk login." : undefined} required error={errors.current_password?.message}>
            {passwordField('current_password', 'current-password', required ? 'Masukkan password yang Anda gunakan untuk login.' : undefined)}
          </FormField>
          <FormField id="profile-new_password" label="Password baru" required hint={NEW_PASSWORD_HINT} error={errors.new_password?.message}>
            {passwordField('new_password', 'new-password', NEW_PASSWORD_HINT)}
          </FormField>
          <FormField id="profile-confirm_password" label="Konfirmasi password baru" required error={errors.confirm_password?.message}>
            {passwordField('confirm_password', 'new-password')}
          </FormField>
          <div>
            <Button type="submit" loading={mutation.isPending} icon={<KeyRound aria-hidden className="size-4" />}>
              {required ? "Simpan dan lanjutkan ke Dashboard" : "Simpan password"}
            </Button>
          </div>
        </form>
      </Card>
      {required && accountCard}
    </>
  );
}
