import { ApiStatus } from '../features/system/api-status';

/** Halaman fondasi sementara; shell & login per role dibangun di Phase 04. */
export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mumtaz Bimbel</h1>
      <p className="text-muted">
        Sistem pencatatan sesi les dan progres belajar Bimbel Mumtaz Sampit.
      </p>
      <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
        <ApiStatus />
      </div>
    </main>
  );
}
