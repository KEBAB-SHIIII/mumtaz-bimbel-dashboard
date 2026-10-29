import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { queryKeys } from '../../lib/query-keys';
import { fetchHealth } from './health-api';

export function ApiStatus() {
  const { isPending, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
  });

  if (isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Memeriksa koneksi API…
      </p>
    );
  }

  if (isError) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-danger">
        <CircleAlert aria-hidden className="size-4" />
        API tidak dapat dihubungi
      </p>
    );
  }

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-success">
      <CircleCheck aria-hidden className="size-4" />
      API terhubung
    </p>
  );
}
