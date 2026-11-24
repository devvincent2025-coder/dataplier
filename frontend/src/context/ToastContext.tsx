import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

const DEFAULT_DURATION_MS = 7_000;

export type ToastVariant = "success" | "error" | "info";

type ToastRecord = {
  id: string;
  message: string;
  variant: ToastVariant;
  exiting: boolean;
};

type ShowToastOptions = {
  variant?: ToastVariant;
  /** Defaults to 7 seconds. Set to 0 to disable auto-dismiss (still closable with X). */
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ShowToastOptions) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current[id];
    if (t) {
      clearTimeout(t);
      delete timersRef.current[id];
    }
  }, []);

  const removeAfterExit = useCallback((id: string) => {
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 240);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((list) =>
        list.map((item) => (item.id === id ? { ...item, exiting: true } : item))
      );
      removeAfterExit(id);
    },
    [clearTimer, removeAfterExit]
  );

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const variant = options?.variant ?? "info";
      const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;

      setToasts((list) => [...list, { id, message, variant, exiting: false }]);

      if (durationMs > 0) {
        clearTimer(id);
        timersRef.current[id] = setTimeout(() => dismiss(id), durationMs);
      }

      return id;
    },
    [clearTimer, dismiss]
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex w-[min(100%-1.5rem,28rem)] -translate-x-1/2 flex-col items-stretch gap-2 px-3 sm:w-[min(100%-2rem,32rem)]"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <ToastBar key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBar({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const variantStyles: Record<ToastVariant, { wrap: string; icon: ReactNode }> = {
    success: {
      wrap: "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-emerald-900/10",
      icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
    },
    error: {
      wrap: "border-rose-200 bg-rose-50 text-rose-900 shadow-rose-900/10",
      icon: <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
    },
    info: {
      wrap: "border-slate-200 bg-white text-slate-900 shadow-slate-900/10",
      icon: <Info className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
    }
  };

  const { wrap, icon } = variantStyles[toast.variant];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${wrap} ${
        toast.exiting ? "dp-toast-exit" : "dp-toast-enter"
      }`}
    >
      {icon}
      <p className="min-w-0 flex-1 pt-0.5 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 text-current opacity-70 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
