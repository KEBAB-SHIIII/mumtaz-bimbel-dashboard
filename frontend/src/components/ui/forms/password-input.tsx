import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentPropsWithRef } from 'react';
import { cn } from '../../../lib/cn';
import { Input } from './field';

type PasswordInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  /** Nama field untuk membedakan tombol pada form dengan beberapa password. */
  visibilityLabel?: string;
};

/** Input password dengan visibilitas lokal; kompatibel dengan register react-hook-form. */
export function PasswordInput({ className, disabled, visibilityLabel = 'password', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={cn(className, 'pe-11')}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={`${visible ? 'Sembunyikan' : 'Tampilkan'} ${visibilityLabel}`}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted hover:text-text focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
