import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Notification, NotificationViewport, type NotificationProps } from './notification';

type Notice = Pick<NotificationProps, 'title' | 'description' | 'status' | 'actions'>;
const NotificationContext = createContext<((notice: Notice) => void) | null>(null);

export function useNotification() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error('useNotification membutuhkan NotificationProvider');
  return notify;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<(Notice & { id: string })[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const notify = useCallback((notice: Notice) => {
    setNotices((current) => [...current.slice(-2), { ...notice, id: crypto.randomUUID() }]);
  }, []);
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <NotificationViewport position="top-right"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        {notices.map(({ id, ...notice }) => (
          <Notification key={id} {...notice} introDelay={0} autoDismissDuration={notice.actions?.length ? 10000 : 6000}
            paused={hovered || focused}
            onDismiss={() => setNotices((current) => current.filter((item) => item.id !== id))} />
        ))}
      </NotificationViewport>
    </NotificationContext.Provider>
  );
}
