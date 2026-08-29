import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { UPLOAD_CATEGORIES } from "@/lib/uploadCategories";

interface R2UploadDialogProps {
  isMobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploadFile: File | null;
  onFileChange: (file: File | null) => void;
  uploadCategory: string;
  onCategoryChange: (category: string) => void;
  customUploadCategory: string;
  onCustomCategoryChange: (value: string) => void;
  uploadingDirect: boolean;
  onSubmit: () => void;
}

/** Upload-to-R2 modal for the Global Library page (mobile Drawer / desktop Dialog). */
export function R2UploadDialog({
  isMobile,
  open,
  onOpenChange,
  uploadFile,
  onFileChange,
  uploadCategory,
  onCategoryChange,
  customUploadCategory,
  onCustomCategoryChange,
  uploadingDirect,
  onSubmit,
}: R2UploadDialogProps) {
  const uploadBody = (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">PDF Document</label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onFileChange(e.target.files[0]);
            }
          }}
          className="w-full rounded-md border border-border bg-surface p-2 text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20 cursor-pointer"
        />
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-medium text-foreground">Select Category Folder</label>
        <div className="grid grid-cols-2 gap-2">
          {UPLOAD_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                uploadCategory === cat.id
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-2 text-muted-foreground"
              }`}
            >
              <span className="font-semibold text-sm">{cat.label}</span>
              <span className="text-[11px] font-mono text-muted-foreground">{cat.desc}</span>
            </button>
          ))}
        </div>

        {uploadCategory === "custom" && (
          <div className="mt-2 space-y-1">
            <label className="text-xs font-medium text-foreground">Custom Category Name</label>
            <input
              type="text"
              placeholder="e.g. mathematics, literature"
              value={customUploadCategory}
              onChange={(e) => onCustomCategoryChange(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>
    </>
  );

  const uploadFooter = (
    <>
      <button
        onClick={() => onOpenChange(false)}
        className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={
          !uploadFile ||
          uploadingDirect ||
          (uploadCategory === "custom" && !customUploadCategory.trim())
        }
        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {uploadingDirect ? "Uploading…" : "Upload File"}
      </button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Upload PDF to Global Vault</DrawerTitle>
            <DrawerDescription>
              Select a PDF and assign a category folder for Cloudflare R2 storage.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-6 pb-2">{uploadBody}</div>
          <DrawerFooter>{uploadFooter}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload PDF to Global Vault</DialogTitle>
          <DialogDescription>
            Select a PDF document and assign a category folder prefix for Cloudflare R2 storage.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">{uploadBody}</div>
        <DialogFooter>{uploadFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
