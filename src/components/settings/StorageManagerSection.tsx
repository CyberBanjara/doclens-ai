import { useEffect, useState } from "react";
import {
  HardDrive,
  Trash2,
  AlertTriangle,
  FileText,
  Mic,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearAllStorage, getStorageOverview, type StorageOverview } from "@/lib/storage";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function StorageManagerSection() {
  const [stats, setStats] = useState<StorageOverview | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const overview = await getStorageOverview();
      setStats(overview);
    } catch (err) {
      console.warn("Failed to load storage overview:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      await clearAllStorage();
      toast.success("All local application data has been wiped.", {
        description: "Reloading application...",
      });
      setTimeout(() => {
        // Full hard navigation to ensure clean state and in-memory singletons reset
        window.location.href = "/settings";
      }, 750);
    } catch (err) {
      console.error("Storage clear failed:", err);
      toast.error("Failed to clear some storage items. Please try again.");
      setIsClearing(false);
      setDialogOpen(false);
    }
  };

  const usagePercent =
    stats && stats.quotaBytes > 0
      ? Math.min(Math.max((stats.usageBytes / stats.quotaBytes) * 100, 0.5), 100)
      : 0;

  return (
    <section className="glass-panel flex flex-col rounded-[18px] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary border border-primary/20">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Local Storage & Privacy</h3>
            <p className="text-xs text-muted-foreground">
              All documents, OCR caches, neural voices, and API keys are stored entirely inside your
              browser.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadStats}
            disabled={loadingStats}
            title="Refresh storage statistics"
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all hover:bg-surface-2 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingStats ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 rounded-full bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive transition-all hover:bg-destructive hover:text-destructive-foreground active:scale-95 shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear All Storage</span>
          </button>
        </div>
      </div>

      {/* Storage Meter */}
      <div className="mb-6 rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Estimated Browser Quota Usage
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <CheckCircle2 className="h-3 w-3" /> 100% On-Device
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-foreground">
            {stats ? (
              <>
                <span className="text-primary">{formatBytes(stats.usageBytes)}</span>
                <span className="text-muted-foreground font-normal">
                  {" "}
                  of ~{formatBytes(stats.quotaBytes)}
                </span>
              </>
            ) : (
              "Calculating..."
            )}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 border border-border/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* IndexedDB */}
        <div className="rounded-xl border border-border bg-surface/40 p-4 transition-all hover:border-border-strong">
          <div className="flex items-center gap-2 mb-1.5 text-primary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">IndexedDB</span>
          </div>
          <div className="text-lg font-bold text-foreground">
            {stats ? `${stats.docCount} ${stats.docCount === 1 ? "Doc" : "Docs"}` : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Documents, PDF blobs, OCR extractions, and translations.
          </p>
        </div>

        {/* OPFS / Voice Cache */}
        <div className="rounded-xl border border-border bg-surface/40 p-4 transition-all hover:border-border-strong">
          <div className="flex items-center gap-2 mb-1.5 text-primary">
            <Mic className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">
              {stats?.isOpfs ? "OPFS Storage" : "Voice Cache"}
            </span>
          </div>
          <div className="text-lg font-bold text-foreground">
            {stats ? `${stats.voiceCount} ${stats.voiceCount === 1 ? "Voice" : "Voices"}` : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Piper ONNX speech models for instant offline playback.
          </p>
        </div>

        {/* Cache Storage */}
        <div className="rounded-xl border border-border bg-surface/40 p-4 transition-all hover:border-border-strong">
          <div className="flex items-center gap-2 mb-1.5 text-primary">
            <Layers className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Cache & Workers</span>
          </div>
          <div className="text-lg font-bold text-foreground">Cache API</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Service worker registrations and cached web assets.
          </p>
        </div>

        {/* Local & Session Storage */}
        <div className="rounded-xl border border-border bg-surface/40 p-4 transition-all hover:border-border-strong">
          <div className="flex items-center gap-2 mb-1.5 text-primary">
            <KeyRound className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Web Storage</span>
          </div>
          <div className="text-lg font-bold text-foreground">Preferences</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            API keys, selected models, languages, themes, and session tokens.
          </p>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/80">
        <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-foreground">Universal In-App Data Control:</strong> Clicking{" "}
          <span className="font-semibold text-destructive">Clear All Storage</span> purges all
          application storage across IndexedDB, OPFS, Cache Storage, localStorage, sessionStorage,
          and service workers using standard browser APIs (Chrome, Brave, Firefox, Edge). No browser
          DevTools or settings inspection required.
        </p>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={(open) => !isClearing && setDialogOpen(open)}>
        <AlertDialogContent className="max-w-lg border-border bg-background shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-xl font-bold text-foreground">
              Permanently clear all application storage?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground space-y-3 pt-2 text-left">
              <span>
                This will permanently delete all data stored by Anuwad in your browser. This action
                is irreversible and includes:
              </span>
              <ul className="list-disc pl-5 space-y-1 text-foreground/90 font-medium">
                <li>All uploaded PDF documents, OCR texts, and AI translations (IndexedDB)</li>
                <li>All downloaded Piper neural voice models (OPFS & Voice Cache)</li>
                <li>All offline cached assets and Service Worker registrations (Cache API)</li>
                <li>
                  Your custom OpenRouter API keys, model selections, and pipeline defaults
                  (localStorage)
                </li>
                <li>All UI theme and font preferences (localStorage)</li>
                <li>Active session states and cookies (sessionStorage & Cookies)</li>
              </ul>
              <span className="block pt-1 text-destructive font-semibold">
                Once confirmed, all local data will be purged and the application will reload with
                default settings.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmClear();
              }}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all font-semibold"
            >
              {isClearing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Purging Storage...
                </>
              ) : (
                "Yes, Clear All Storage"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
