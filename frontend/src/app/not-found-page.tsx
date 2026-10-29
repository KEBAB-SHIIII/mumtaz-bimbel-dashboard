import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <Link to="/" className="text-primary underline underline-offset-4">
        Kembali ke beranda
      </Link>
    </main>
  );
}
