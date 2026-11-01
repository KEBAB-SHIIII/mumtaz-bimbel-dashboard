import { ChevronRight } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
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

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Kartu angka ringkasan. Dengan `to`, seluruh kartu menjadi tautan ke data di balik angka itu
 * (stretched link: markup `<dl>` tetap valid dan nama tautan = label kartu).
 */
export function StatCard({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-border bg-surface p-4 shadow-sm',
        to && 'transition-colors focus-within:ring-2 focus-within:ring-focus-ring hover:border-text/30 hover:bg-surface-muted',
      )}
    >
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
        {to ? (
          <Link to={to} className="outline-none after:absolute after:inset-0 after:rounded-lg">
            {label}
          </Link>
        ) : (
          label
        )}
        {to && <ChevronRight aria-hidden className="size-4 shrink-0" />}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-text">{value}</dd>
      {hint && <dd className="relative mt-1">{hint}</dd>}
    </div>
  );
}

/** Baris filter yang membungkus ke bawah di layar kecil. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
