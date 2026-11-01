import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHeaderSlots } from '../layout/header-slot';
import { cn } from '../../lib/cn';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  // Judul tab browser mengikuti halaman aktif (riwayat & banyak tab mudah dibedakan).
  useEffect(() => {
    document.title = `${title} · Mumtaz Bimbel`;
  }, [title]);
  const slots = useHeaderSlots();

  // Di dalam AppShell, judul tampil di header aplikasi (docs/design/03-layout.md); deskripsi & aksi tetap di isi halaman.
  if (slots) {
    return (
      <>
        {slots.title &&
          createPortal(
            <h1 className="line-clamp-2 text-page-title-mobile text-balance text-text lg:text-page-title">{title}</h1>,
            slots.title,
          )}
        {(description || actions) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            {description && <p className="max-w-prose text-sm text-pretty text-muted">{description}</p>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
      </>
    );
  }

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-page-title-mobile text-balance text-text lg:text-page-title">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-pretty text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

interface CardProps {
  title?: string;
  /** Subjudul di bawah judul (Ref 2), mis. periode. */
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Kartu konten: judul + subjudul di kiri, aksi di kanan (Ref 2). Radius `lg` (14px). */
export function Card({ title, description, actions, children, className }: CardProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-surface shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          {title && (
            <div className="min-w-0">
              <h2 className="text-card-title text-balance text-text">{title}</h2>
              {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
            </div>
          )}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export { StatCard } from './stat-card';

/** Baris filter yang membungkus ke bawah di layar kecil. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-meta font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
