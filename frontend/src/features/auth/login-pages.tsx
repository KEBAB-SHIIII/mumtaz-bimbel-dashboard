import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { loginRequestSchema, parentAccessRequestSchema, type LoginRequest, type ParentAccessRequest, type Role } from '@mumtaz/contracts';
import { Button } from '../../components/ui/button';
import { InlineAlert, LoadingState } from '../../components/ui/feedback';
import { FormField, Input, describedBy } from '../../components/ui/field';
import { SpotlightCard } from '../../components/ui/spotlight-card';
import { toApiError } from '../../lib/api-error';
import { ROLE_HOME, useLoginMutation, useParentAccessMutation, useSession } from './session';

function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Mumtaz Bimbel`;
  }, [title]);
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {/* Aksen gradien hijau lembut di satu sisi (bukan pelangi), dekoratif. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -end-40 -z-10 size-[32rem] rounded-full bg-radial from-nav-active-from/35 via-nav-active-to/15 to-transparent blur-2xl"
      />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-md bg-primary text-base font-bold text-primary-foreground shadow-sm">M</span>
          <p className="text-base font-semibold text-text">Mumtaz Bimbel</p>
        </div>
        <SpotlightCard className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-7">
          <h1 className="text-page-title-mobile text-balance text-text">{title}</h1>
          <p className="mt-1 text-sm text-pretty text-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </SpotlightCard>
        <div className="mt-5 text-center text-sm text-pretty text-muted">{footer}</div>
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
          Orang tua/wali? <Link className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 sm:min-h-0" to="/login/orang-tua">Masuk dengan ID Akses</Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
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
              className="pe-11"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('password', errors.password?.message)}
              {...form.register('password')}
            />
            <button
              type="button"
              className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted hover:text-text focus-visible:-outline-offset-2"
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </FormField>
        <Button type="submit" loading={mutation.isPending} icon={<LogIn aria-hidden className="size-4" />} className="mt-1 w-full">
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
          Admin atau tutor? <Link className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 sm:min-h-0" to="/login">Masuk dengan username</Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
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
        <Button type="submit" loading={mutation.isPending} icon={<KeyRound aria-hidden className="size-4" />} className="mt-1 w-full">
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
