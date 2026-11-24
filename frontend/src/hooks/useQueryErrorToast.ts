import { useEffect, useRef } from "react";

type ShowToast = (message: string, options?: { variant?: "success" | "error" | "info"; durationMs?: number }) => void;

/**
 * Fires one error toast per query error episode (clears when `isError` becomes false).
 */
export function useQueryErrorToast(isError: boolean, error: unknown, fallbackMessage: string, showToast: ShowToast) {
  const toasted = useRef(false);
  useEffect(() => {
    if (!isError) {
      toasted.current = false;
      return;
    }
    if (toasted.current) {
      return;
    }
    toasted.current = true;
    const msg = error instanceof Error ? error.message : fallbackMessage;
    showToast(msg, { variant: "error" });
  }, [isError, error, fallbackMessage, showToast]);
}
