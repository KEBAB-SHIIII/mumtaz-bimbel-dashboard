import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
  size?: 'md' | 'lg';
}

/**
 * Dialog aksesibel (Headless UI): fokus terkunci di dalam, Escape menutup,
 * fokus dikembalikan ke pemicu saat ditutup.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-overlay transition-opacity duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          transition
          className={cn(
            'flex max-h-[90dvh] w-full flex-col bg-surface shadow-lg',
            // HP: bottom sheet dari bawah 300ms. ≥ 640px: fade + scale 0.96 + naik 8px; masuk 250ms ease-out, keluar 180ms ease-in.
            'rounded-t-xl pb-[env(safe-area-inset-bottom)] transition duration-300 ease-out data-closed:translate-y-full',
            'sm:rounded-lg sm:pb-0 sm:duration-250 sm:data-closed:translate-y-2 sm:data-closed:scale-96 sm:data-closed:opacity-0',
            'data-leave:duration-180 data-leave:ease-in motion-reduce:transition-none',
            size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          {/* Pegangan visual bottom sheet (HP saja). */}
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-3 sm:pt-4">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-balance text-text">{title}</DialogTitle>
              {description && <Description className="mt-1 text-sm text-pretty text-muted">{description}</Description>}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Tutup" className="-me-1.5 -mt-1" onClick={onClose}>
              <X aria-hidden className="size-4" />
            </Button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end max-sm:*:w-full">
              {footer}
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  /** Konten tambahan, mis. field alasan wajib. */
  children?: ReactNode;
  confirmDisabled?: boolean;
}

/** Konfirmasi untuk aksi berdampak (docs/07 §2): tolak, revisi, nonaktifkan, rotasi kode. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  loading = false,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? null}
    </Modal>
  );
}
