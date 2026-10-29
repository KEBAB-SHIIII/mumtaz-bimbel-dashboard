import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react';
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
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel
          className={cn(
            'flex max-h-[90dvh] w-full flex-col rounded-t-lg bg-surface shadow-md sm:rounded-lg',
            size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <DialogTitle className="text-base font-semibold text-text">{title}</DialogTitle>
              {description && <Description className="mt-1 text-sm text-muted">{description}</Description>}
            </div>
            <Button variant="ghost" size="sm" aria-label="Tutup" className="px-1.5" onClick={onClose}>
              <X aria-hidden className="size-4" />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
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
