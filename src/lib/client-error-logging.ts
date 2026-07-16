import { reportLovableError } from "./lovable-error-reporting";

let installed = false;

/**
 * Install browser-side global error listeners. Forwards uncaught errors and
 * unhandled promise rejections to console.error (visible in Server Logs when
 * captured by the preview shell) and to reportLovableError so the editor's
 * telemetry receives them.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function installClientErrorLogging() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const error = event.error ?? new Error(event.message || "Unknown error");
    console.error("[client:onerror]", error);
    reportLovableError(error, {
      source: "window.onerror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    console.error("[client:unhandledrejection]", reason);
    reportLovableError(reason, { source: "window.unhandledrejection" });
  });
}
