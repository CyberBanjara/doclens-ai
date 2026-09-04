import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearSelectedStorage,
  getStorageOverview,
  type StorageOverview,
} from "@/lib/storage";
import { toast } from "sonner";

interface StorageItemOption {
  id: "documents" | "voices";
  title: string;
  description: string;
  badge?: string;
}

export function StorageManagerSection() {
  const [stats, setStats] = useState<StorageOverview | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Selection states for documents and voices (default all selected)
  const [selected, setSelected] = useState<Record<"documents" | "voices", boolean>>({
    documents: true,
    voices: true,
  });

  const loadStats = async () => {
    try {
      const overview = await getStorageOverview();
      setStats(overview);
    } catch (err) {
      console.warn("Failed to load storage overview:", err);
    }
  };

  useEffect(() => {
    if (dialogOpen) {
      void loadStats();
    }
  }, [dialogOpen]);

  const items: StorageItemOption[] = [
    {
      id: "documents",
      title: "Documents & Translations",
      description: "Uploaded PDF documents, reading notes, and AI translations.",
      badge: stats ? `${stats.docCount} ${stats.docCount === 1 ? "doc" : "docs"}` : undefined,
    },
    {
      id: "voices",
      title: "Offline Neural Voices",
      description: "Downloaded neural voice models for offline text-to-speech.",
      badge: stats ? `${stats.voiceCount} ${stats.voiceCount === 1 ? "voice" : "voices"}` : undefined,
    },
  ];

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const isAllSelected = selectedCount === items.length;

  const toggleSelectAll = () => {
    const nextState = !isAllSelected;
    setSelected({
      documents: nextState,
      voices: nextState,
    });
  };

  const toggleItem = (id: "documents" | "voices") => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleConfirmDelete = async () => {
    if (selectedCount === 0) return;

    setIsClearing(true);
    try {
      await clearSelectedStorage(selected);
      toast.success("Selected data deleted successfully.", {
        description: "Refreshing application...",
      });

      setTimeout(() => {
        window.location.href = "/settings";
      }, 600);
    } catch (err) {
      console.error("Storage delete failed:", err);
      toast.error("Failed to delete selected storage. Please try again.");
      setIsClearing(false);
    }
  };

  return (
    <>
      {/* ─── Classic, Clean, Centered "Delete Data" Button ─── */}
      <div className="w-full flex flex-col items-center justify-center pt-8 pb-10 border-t border-border/30 mt-4">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-xl border border-border bg-surface-2/70 px-9 py-3 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-surface-2 hover:border-border-strong hover:shadow-md active:scale-95 shadow-xs cursor-pointer min-w-[160px] text-center"
        >
          Delete Data
        </button>
      </div>

      {/* ─── Classic Data Selection & Deletion Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !isClearing && setDialogOpen(open)}>
        <DialogContent className="max-w-md border-border bg-background shadow-2xl p-6 sm:rounded-2xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-bold text-foreground">
              Delete Application Data
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select the data you want to delete from your browser.
            </DialogDescription>
          </DialogHeader>

          {/* ─── Selection Quick Toolbar ─── */}
          <div className="flex items-center justify-between border-y border-border/60 py-2 px-0.5 mt-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={isClearing}
              className="text-xs font-medium text-primary hover:underline transition-all cursor-pointer disabled:opacity-50"
            >
              {isAllSelected ? "Deselect All" : "Select All"}
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {selectedCount} of {items.length} selected
            </span>
          </div>

          {/* ─── Items List with Classic Checkbox & Card Styling ─── */}
          <div className="space-y-2 mt-1">
            {items.map((item) => {
              const isChecked = selected[item.id];

              return (
                <div
                  key={item.id}
                  onClick={() => !isClearing && toggleItem(item.id)}
                  className={`group flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer select-none ${
                    isChecked
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/60 bg-surface/40 hover:border-border"
                  }`}
                >
                  {/* Classic Checkbox */}
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-all ${
                      isChecked
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-muted-foreground/40 bg-background group-hover:border-foreground/60"
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>

                  {/* Text Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{item.title}</span>
                      {item.badge && (
                        <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Modal Footer ─── */}
          <DialogFooter className="mt-4 flex flex-row items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={isClearing}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isClearing || selectedCount === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>
                  Delete Selected {selectedCount > 0 ? `(${selectedCount})` : ""}
                </span>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
