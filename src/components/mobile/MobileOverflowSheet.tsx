import { Link } from "@tanstack/react-router";
import { Cloud, FileJson, RefreshCw, Settings, Sparkles, Zap } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { exportAsMarkdown, exportAsJson } from "@/lib/export";

interface MobileOverflowSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
  pageCount: number;
  analyzing: boolean;
  status: string;
  uploading: boolean;
  syncingSupabase: boolean;
  syncEnabled: boolean;
  onAnalyze: () => void;
  onUploadToR2: () => void;
  onSyncToSupabase: () => void;
}

/** Houses the header actions that don't belong in the primary reading chrome. */
export function MobileOverflowSheet({
  open,
  onOpenChange,
  docId,
  pageCount,
  analyzing,
  status,
  uploading,
  syncingSupabase,
  syncEnabled,
  onAnalyze,
  onUploadToR2,
  onSyncToSupabase,
}: MobileOverflowSheetProps) {
  const close = () => onOpenChange(false);

  const items: {
    icon: React.ReactNode;
    label: string;
    sublabel?: string;
    disabled?: boolean;
    onClick: () => void;
  }[] = [];

  if (pageCount === 0) {
    items.push({
      icon: <Sparkles className="h-4 w-4" />,
      label: analyzing ? "Analyzing…" : "Analyze Document",
      disabled: analyzing,
      onClick: () => {
        onAnalyze();
        close();
      },
    });
  } else {
    items.push({
      icon: <RefreshCw className="h-4 w-4" />,
      label: analyzing ? status || "Re-extracting…" : "Re-extract Pages",
      disabled: analyzing,
      onClick: () => {
        onAnalyze();
        close();
      },
    });
    items.push({
      icon: <FileJson className="h-4 w-4" />,
      label: "Export as Markdown",
      onClick: () => {
        void exportAsMarkdown(docId);
        close();
      },
    });
    items.push({
      icon: <FileJson className="h-4 w-4" />,
      label: "Export as JSON",
      onClick: () => {
        void exportAsJson(docId);
        close();
      },
    });
    if (syncEnabled) {
      items.push({
        icon: <Cloud className="h-4 w-4" />,
        label: uploading ? "Uploading…" : "Upload to Cloudflare R2",
        disabled: uploading,
        onClick: () => {
          onUploadToR2();
          close();
        },
      });
      items.push({
        icon: <Zap className="h-4 w-4" />,
        label: syncingSupabase ? "Syncing…" : "Sync to Supabase",
        disabled: syncingSupabase,
        onClick: () => {
          onSyncToSupabase();
          close();
        },
      });
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Document Actions</DrawerTitle>
          <DrawerDescription>Analysis, export, and sync options for this document.</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-4">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-foreground transition-colors active:bg-surface-2 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
          <Link
            to="/settings"
            onClick={close}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-foreground transition-colors active:bg-surface-2"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
              <Settings className="h-4 w-4" />
            </span>
            Settings
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
