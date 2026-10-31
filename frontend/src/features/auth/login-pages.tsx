import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { loginRequestSchema, parentAccessRequestSchema, type LoginRequest, type ParentAccessRequest, type Role } from '@mumtaz/contracts';
import { Button } from '../../components/ui/button';
import { InlineAlert, LoadingState } from '../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../components/ui/field';
import { toApiError } from '../../lib/api-error';
import { ROLE_HOME, useLoginMutation, useParentAccessMutation, useSession } from './session';

function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Mumtaz Bimbel`;
  }, [title]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide text-muted uppercase">Mumtaz Bimbel</p>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-4 text-center text-sm text-muted">{footer}</div>
      </div>
    </main>
  );
}

/** Setelah login: kembali ke halaman asal bila milik role yang sama, selain itu ke dashboard role. */
function useAfterLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (role: Role) => {
    const home = ROLE_HOME[role];
    navigate(from?.startsWith(home) ? from : home, { replace: true });
  };
}

function AlreadySignedIn() {
  const session = useSession();
  if (session.isPending) return <LoadingState label="Memeriksa sesi…" className="min-h-dvh" />;
  if (session.data) return <Navigate to={ROLE_HOME[session.data.role]} replace />;
  return null;
}

export function StaffLoginPage() {
  const session = useSession();
  const mutation = useLoginMutation();
  const afterLogin = useAfterLogin();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema), defaultValues: { username: '', password: '' } });
  const { errors } = form.formState;

  if (session.isPending || session.data) return <AlreadySignedIn />;

  const onSubmit = form.handleSubmit((values) =>
    mutation.mutate(values, { onSuccess: (user) => afterLogin(user.role) }),
  );

  return (
    <AuthLayout
      title="Masuk Admin / Tutor"
      description="Gunakan username dan password akun Anda."
      footer={
        <>
          Orang tua/wali? <Link className="font-medium text-primary underline underline-offset-4" to="/login/orang-tua">Masuk dengan ID Akses</Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {mutation.isError && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="username" label="Username" required error={errors.username?.message}>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(errors.username)}
            aria-describedby={describedBy('username', errors.username?.message)}
            {...form.register('username')}
          />
        </FormField>
        <FormField id="password" label="Password" required error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('password', errors.password?.message)}
              {...form.register('password')}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-text"
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </FormField>
        <Button type="submit" loading={mutation.isPending} icon={<LogIn aria-hidden className="size-4" />}>
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ParentLoginPage() {
  const session = useSession();
  const mutation = useParentAccessMutation();
  const afterLogin = useAfterLogin();
  const form = useForm<ParentAccessRequest>({ resolver: zodResolver(parentAccessRequestSchema), defaultValues: { access_code: '' } });
  const error = form.formState.errors.access_code?.message;
  const hint = 'Kode diberikan Admin secara pribadi. Jangan bagikan kode ini kepada orang lain.';

  if (session.isPending || session.data) return <AlreadySignedIn />;

  const onSubmit = form.handleSubmit((values) =>
    mutation.mutate(values, {
      onSuccess: (user) => {
        // Kode tidak disimpan di UI setelah login.
        form.reset({ access_code: '' });
        afterLogin(user.role);
      },
    }),
  );

  return (
    <AuthLayout
      title="Masuk Orang Tua/Wali"
      description="Masukkan ID Akses Orang Tua untuk melihat progres belajar anak."
      footer={
        <>
          Admin atau tutor? <Link className="font-medium text-primary underline underline-offset-4" to="/login">Masuk dengan username</Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {mutation.isError && <InlineAlert tone="danger" title={toApiError(mutation.error).message} />}
        <FormField id="access_code" label="ID Akses Orang Tua" required hint={hint} error={error}>
          <Input
            id="access_code"
            type="password"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy('access_code', error, hint)}
            {...form.register('access_code')}
          />
        </FormField>
        <Button type="submit" loading={mutation.isPending} icon={<KeyRound aria-hidden className="size-4" />}>
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
