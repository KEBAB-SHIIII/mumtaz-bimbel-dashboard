/**
 * Sinkronisasi event autentikasi antar-tab pada origin yang sama menggunakan BroadcastChannel.
 * Tidak pernah menyimpan token atau PII ke localStorage/sessionStorage.
 */
export const AUTH_SYNC_CHANNEL = 'mumtaz-auth-sync';

export type AuthSyncEventType = 'session_changed' | 'logged_out';

interface AuthSyncMessage {
  type: AuthSyncEventType;
  sender: string;
}

const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

function isAuthSyncMessage(value: unknown): value is AuthSyncMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === 'session_changed' || candidate.type === 'logged_out') &&
    typeof candidate.sender === 'string'
  );
}

/** Beri tahu tab lain di browser yang sama bahwa sesi aktif baru berubah atau logout. */
export function broadcastAuthChange(type: AuthSyncEventType, sender: string = TAB_ID): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage({ type, sender } satisfies AuthSyncMessage);
    channel.close();
  } catch {
    // Abaikan bila lingkungan browser membatasi BroadcastChannel.
  }
}

/** Dengarkan perubahan sesi dari tab lain (mengabaikan pesan dari tab ini sendiri). */
export function subscribeAuthChange(
  handler: (type: AuthSyncEventType) => void,
  selfId: string = TAB_ID,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
  } catch {
    return () => undefined;
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isAuthSyncMessage(event.data)) return;
    if (event.data.sender === selfId) return;
    handler(event.data.type);
  };

  channel.addEventListener('message', onMessage);
  return () => {
    channel.removeEventListener('message', onMessage);
    channel.close();
  };
}
