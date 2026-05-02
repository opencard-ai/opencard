/**
 * Tiny event-bus toast helper. Any client component can fire `toast.success(...)`;
 * the global <ToastViewport /> in app/[lang]/layout listens for the matching
 * window event and renders the toasts.
 *
 * Why event-bus instead of Context: avoids forcing a Provider into the static-
 * generated layout tree and survives Suspense boundaries cleanly.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastPayload {
  id: string;
  message: string;
  kind: ToastKind;
  /** ms before auto-dismiss. 0 = sticky. */
  duration: number;
}

const EVENT_NAME = "opencard:toast";

function emit(payload: Omit<ToastPayload, "id"> & { id?: string }) {
  if (typeof window === "undefined") return;
  const full: ToastPayload = {
    id: payload.id ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    message: payload.message,
    kind: payload.kind,
    duration: payload.duration,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: full }));
}

export const toast = {
  success(message: string, duration = 2400) {
    emit({ message, kind: "success", duration });
  },
  error(message: string, duration = 4000) {
    emit({ message, kind: "error", duration });
  },
  info(message: string, duration = 2400) {
    emit({ message, kind: "info", duration });
  },
};

export const TOAST_EVENT = EVENT_NAME;
