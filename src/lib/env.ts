export function isGlobalSyncEnabled(): boolean {
  if (typeof process !== "undefined" && process?.env) {
    if (
      process.env.ENABLE_GLOBAL_SYNC === "false" ||
      process.env.VITE_ENABLE_GLOBAL_SYNC === "false"
    ) {
      return false;
    }
  }

  try {
    const env = (import.meta as any).env;
    if (env) {
      if (env.ENABLE_GLOBAL_SYNC === "false" || env.VITE_ENABLE_GLOBAL_SYNC === "false") {
        return false;
      }
    }
  } catch {
    // Ignore context errors
  }

  return true;
}
