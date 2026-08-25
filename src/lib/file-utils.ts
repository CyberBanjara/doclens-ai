export interface R2File {
  key: string;
  size: number;
  lastModified?: string;
  url?: string;
}

export interface ParsedR2File extends R2File {
  category: string;
  displayName: string;
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateStr?: string) {
  if (!dateStr) return "Unknown";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (e) {
    return dateStr;
  }
}

export function fileToBase64(file: Blob | File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType = "application/pdf") {
  const byteCharacters = atob(base64);
  const len = byteCharacters.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function parseFileCategory(file: R2File): ParsedR2File {
  const parts = file.key.split("/");
  if (parts.length > 1 && parts[0].trim().length > 0) {
    const category = parts[0].trim().toLowerCase();
    const displayName = parts.slice(1).join("/");
    return { ...file, category, displayName };
  }
  return { ...file, category: "uncategorized", displayName: file.key };
}
