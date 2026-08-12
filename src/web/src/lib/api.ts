/**
 * Returns the full API URL for frontend fetch calls.
 * In desktop Tauri mode (tauri:// protocol or window.__TAURI__ present),
 * prepends http://localhost:5170 to relative /api paths.
 */
export function getApiUrl(path: string): string {
  const isTauri =
    typeof window !== "undefined" &&
    (Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_INTERNALS__) ||
      window.location.protocol === "tauri:" ||
      window.location.hostname === "tauri.localhost");

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isTauri) {
    return `http://localhost:5170${normalizedPath}`;
  }
  return normalizedPath;
}
