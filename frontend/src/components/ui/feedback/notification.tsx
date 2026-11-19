// Adapted from BoardUI Notification: https://www.boardui.com/components/notification
// Uses local UI tokens, Lucide icons, and the existing Motion provider.

import type {
  ComponentType,
  ReactNode,
  Ref,
} from "react";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CircleAlert,
  Info,
  Bell,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Button } from "../actions/button";
import { X } from "lucide-react";
import { cn as cx } from "../../../lib/cn";

export type NotificationStatus = "neutral" | "information" | "success" | "error";

export type NotificationPosition =
  | "top-start"
  | "top-end"
  | "bottom-start"
  | "bottom-end"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;


export type NotificationAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
};

export interface NotificationProps
  extends Omit<
    HTMLMotionProps<"div">,
    | "title"
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationEnd"
  > {
  title: ReactNode;
  description?: ReactNode;
  timestamp?: ReactNode;
  status?: NotificationStatus;
  /** Custom leading icon. Defaults to the icon associated with `status`. */
  icon?: IconComponent;

  /** Optional small BoardUI action buttons rendered below the message. */
  actions?: NotificationAction[];
  dismissible?: boolean;
  closeLabel?: string;
  /** Called after the dismiss animation completes. */
  onDismiss?: () => void;
  /**
   * Automatically dismiss after this many milliseconds. A 3px blue countdown
   * bar is rendered along the full bottom edge for the same duration.
   */
  autoDismissDuration?: number;
  /**
   * Hold the auto-dismiss countdown and its bar, e.g. while the pointer or
   * focus is in a toast stack. The countdown resumes where it stopped.
   */
  paused?: boolean;
  /** Dismiss from outside: plays the exit animation, then calls `onDismiss`. */
  dismissed?: boolean;
  /** Optional entrance delay in seconds. */
  introDelay?: number;
  ref?: Ref<HTMLDivElement>;
}

export interface NotificationViewportProps
  extends Omit<
    HTMLMotionProps<"div">,
    | "children"
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationEnd"
  > {
  children?: ReactNode;
  /** Edge or corner where the notification stack is anchored. */
  position?: NotificationPosition;
  /** @deprecated Use `position` instead. */
  placement?: Extract<NotificationPosition, "bottom-left" | "bottom-right">;
}

const STATUS_ICON: Record<NotificationStatus, IconComponent> = {
  neutral: Bell,
  information: Info,
  success: Check,
  error: CircleAlert,
};

const styles = {
  card: [
    "relative flex w-full items-start gap-2.5 overflow-hidden p-4 pe-12",
    "rounded-lg border border-primary/15",
    "shadow-md",
  ].join(" "),
  visual: "mt-0.5 flex size-5 shrink-0 items-center justify-center",
  icon: "size-5",
  content: "flex min-w-0 flex-1 flex-col gap-1",
  header: "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5",
  title: "text-sm font-semibold text-text",
  timestamp: "text-sm text-muted",
  description: "text-sm text-muted",
  actions: "mt-1.5 flex flex-wrap items-center gap-2",
  close: "absolute top-1 end-1 grid size-11 place-items-center rounded-md text-muted hover:text-text",
  status: {
    neutral: "bg-surface-muted text-text",
    information:
      "bg-notification-surface text-text",
    success:
      "bg-notification-surface text-text",
    error:
      "bg-danger-subtle text-danger-strong",
  },

};

const VIEWPORT_POSITION = {
  "top-start": "top-3 start-3 items-start sm:top-6 sm:start-6",
  "top-end": "top-3 end-3 items-end sm:top-6 sm:end-6",
  "bottom-start": "bottom-3 start-3 items-start sm:bottom-6 sm:start-6",
  "bottom-end": "end-3 bottom-3 items-end sm:end-6 sm:bottom-6",
  "top-left": "top-3 left-3 items-start sm:top-6 sm:left-6",
  "top-center": "top-3 left-1/2 -translate-x-1/2 items-center sm:top-6",
  "top-right": "top-3 right-3 items-end sm:top-6 sm:right-6",
  "bottom-left": "bottom-3 left-3 items-start sm:bottom-6 sm:left-6",
  "bottom-center":
    "bottom-3 left-1/2 -translate-x-1/2 items-center sm:bottom-6",
  "bottom-right": "right-3 bottom-3 items-end sm:right-6 sm:bottom-6",
} satisfies Record<NotificationPosition, string>;

const subscribeToHydration = () => () => {};

export function Notification({
  title,
  description,
  timestamp,
  status = "neutral",
  icon,
  actions,
  dismissible = true,
  closeLabel = "Tutup notifikasi",
  onDismiss,
  autoDismissDuration,
  paused = false,
  dismissed: dismissedProp = false,
  introDelay,
  className,
  ref,
  role,
  ...props
}: NotificationProps) {
  const [dismissedState, setDismissed] = useState(false);
  const dismissed = dismissedProp || dismissedState;
  const Icon = icon ?? STATUS_ICON[status];
  const reducedMotion = useReducedMotion();
  const hasIntro = introDelay !== undefined && !reducedMotion;
  const introDelayMs = (introDelay ?? 0) * 1000;
  const timed = Boolean(autoDismissDuration && autoDismissDuration > 0);

  // The countdown bar runs as one native Web Animation so `paused` can hold
  // and resume it in step with the timer below. (Motion's standalone
  // animate() on this child cancelled the card's own enter animation.)
  const barRef = useRef<HTMLSpanElement>(null);
  const bar = useRef<Animation | null>(null);
  const remaining = useRef((autoDismissDuration ?? 0) + introDelayMs);

  useEffect(() => {
    const element = barRef.current;
    if (!timed || !element?.animate) return;
    bar.current = element.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration: autoDismissDuration ?? 0, delay: introDelayMs, easing: "linear", fill: "forwards" },
    );
    return () => bar.current?.cancel();
  }, [timed, autoDismissDuration, introDelayMs]);

  useEffect(() => {
    if (!timed || dismissed) return;
    if (paused) {
      bar.current?.pause();
      return;
    }
    bar.current?.play();
    const startedAt = performance.now();
    const timer = window.setTimeout(() => setDismissed(true), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt));
    };
  }, [timed, paused, dismissed]);

  return (
    <AnimatePresence {...(onDismiss ? { onExitComplete: onDismiss } : {})}>
      {!dismissed ? (
        <m.div
          ref={ref}
          role={role ?? (status === "error" ? "alert" : "status")}
          initial={
            hasIntro
              ? { opacity: 0, y: -6 }
              : false
          }
          animate={
            hasIntro
              ? {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.25,
                    delay: introDelay ?? 0,
                    ease: "easeOut",
                  },
                }
              : {}
          }
          exit={{
            opacity: 0,
            y: reducedMotion ? 0 : -4,
            transition: { duration: 0.18, ease: "easeOut" },
          }}
          className={cx(styles.card, styles.status[status], className)}
          {...props}
        >
          <span className={cx(styles.visual, status === "error" ? "text-danger-strong" : "text-primary")}>
            <Icon className={styles.icon} aria-hidden />
          </span>

          <div className={styles.content}>
            <div className={styles.header}>
              <p className={styles.title}>{title}</p>
              {timestamp ? <span className={styles.timestamp}>{timestamp}</span> : null}
            </div>
            {description ? <p className={styles.description}>{description}</p> : null}

            {actions?.length ? (
              <div className={styles.actions}>
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={action.variant ?? (index === 0 ? "secondary" : "primary")}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          {dismissible ? (
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => setDismissed(true)}
              className={styles.close}
            ><X aria-hidden className="size-4" /></button>
          ) : null}

          {timed ? (
            <span
              ref={barRef}
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left rtl:origin-right bg-primary/40"
            />
          ) : null}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Viewport-level notification region. Anchor the stack to any corner or
 * horizontal center with `position`; children with stable keys move smoothly
 * as notifications enter and leave.
 */
export function NotificationViewport({
  children,
  position,
  placement,
  className,
  "aria-label": ariaLabel = "Notifikasi",
  ...props
}: NotificationViewportProps) {

  const resolvedPosition = position ?? placement ?? "top-end";
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <m.div
      layoutRoot
      aria-label={ariaLabel}
      className={cx(
        "pointer-events-none fixed z-100 flex w-[min(400px,calc(100vw-24px))] flex-col gap-3",
        VIEWPORT_POSITION[resolvedPosition],
        resolvedPosition.startsWith("top") ? "mt-[env(safe-area-inset-top)]" : "mb-[env(safe-area-inset-bottom)]",
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {Children.toArray(children).map((child, index) => (
          <m.div
            layout
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="pointer-events-auto w-full"
            transition={{
              layout: {
                type: "spring",
                stiffness: 520,
                damping: 42,
                mass: 0.7,
              },
            }}
          >
            {child}
          </m.div>
        ))}
      </AnimatePresence>
    </m.div>,
    document.body,
  );
}
