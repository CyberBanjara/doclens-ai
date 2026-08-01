/**
 * Whether the optional Global Library feature (Cloudflare R2 vault + Supabase
 * extraction cache) is enabled. Server-side only — checks both the plain and
 * `VITE_`-prefixed variants of the flag, since different deploy targets expose
 * server env vars differently.
 */
export function isGlobalSyncEnabled(): boolean {
  return (
    process.env.ENABLE_GLOBAL_SYNC === "true" ||
    process.env.VITE_ENABLE_GLOBAL_SYNC === "true" ||
    (import.meta as any).env?.ENABLE_GLOBAL_SYNC === "true" ||
    (import.meta as any).env?.VITE_ENABLE_GLOBAL_SYNC === "true"
  );
}
