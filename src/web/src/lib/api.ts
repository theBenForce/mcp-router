/**
 * Returns the full API URL for frontend fetch calls.
 * In desktop Tauri mode (tauri:// protocol or window.__TAURI__ present),
 * prepends http://localhost:5170 to relative /api paths.
 */
export function getApiUrl(path: string): string {
  if (typeof window === "undefined") return path;

  const isTauri =
    Boolean((window as any).__TAURI__) ||
    Boolean((window as any).__TAURI_INTERNALS__) ||
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost" ||
    window.location.origin.includes("tauri");

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isTauri && (normalizedPath.startsWith("/api") || normalizedPath.startsWith("/health"))) {
    const port = (window as any).__ACTIVE_BACKEND_PORT__ || 5170;
    return `http://localhost:${port}${normalizedPath}`;
  }
  return normalizedPath;
}
