import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { UPLOAD_CATEGORIES, UPLOAD_EDUCATION_LEVELS } from "@/lib/uploadCategories";
import { ArrowLeft, ArrowRight, Check, CloudUpload, FileText, FolderTree, RotateCcw } from "lucide-react";

export interface R2UploadDialogProps {
  isMobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploadFile?: File | null;
  onFileChange?: (file: File | null) => void;
  existingDocFileName?: string;
  uploadCategory: string;
  onCategoryChange: (category: string) => void;
  uploadEducationLevel: string;
  onEducationLevelChange: (level: string) => void;
  uploadingDirect: boolean;
  onSubmit: (customFileName: string) => void;
}

/** 2-Step (Subject -> Class) Upload-to-R2 modal with folder hierarchy and editable filename. */
export function R2UploadDialog({
  isMobile,
  open,
  onOpenChange,
  uploadFile,
  onFileChange,
  existingDocFileName,
  uploadCategory,
  onCategoryChange,
  uploadEducationLevel,
  onEducationLevelChange,
  uploadingDirect,
  onSubmit,
}: R2UploadDialogProps) {
  // Step state: 1 = Subject, 2 = Class
  const [step, setStep] = useState<1 | 2>(1);

  const initialFileName = existingDocFileName || uploadFile?.name || "document.pdf";
  const [customFileName, setCustomFileName] = useState(initialFileName);

  // Reset to Step 1 & sync filename whenever modal opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setCustomFileName(initialFileName);
    }
  }, [open, initialFileName]);

  const selectedSubjectMeta =
    UPLOAD_CATEGORIES.find((c) => c.id === uploadCategory) || UPLOAD_CATEGORIES[0];
  const selectedClassMeta =
    UPLOAD_EDUCATION_LEVELS.find((l) => l.id === uploadEducationLevel) || UPLOAD_EDUCATION_LEVELS[1];

  // Clean filename and ensure .pdf extension
  const trimmedName = customFileName.trim().replace(/[\/\\]/g, "_") || initialFileName;
  const finalFileName = trimmedName.toLowerCase().endsWith(".pdf")
    ? trimmedName
    : `${trimmedName}.pdf`;

  const folderPrefix =
    uploadEducationLevel && uploadEducationLevel !== "general"
      ? `${uploadCategory}/${uploadEducationLevel}/`
      : `${uploadCategory}/`;

  const previewPath = `${folderPrefix}${finalFileName}`;
  const isFileReady = Boolean(existingDocFileName || uploadFile);

  const dialogHeaderContent = (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
          <CloudUpload className="h-4 w-4" />
        </div>
        <DialogTitle className="text-base font-bold text-foreground">
          Upload to Cloudflare R2
        </DialogTitle>
      </div>

      {/* Step Navigation Pills */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer border ${
            step === 1
              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30 shadow-sm"
              : "border-border/70 bg-surface/60 text-muted-foreground hover:text-foreground hover:bg-surface-2"
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              1
            </span>
            <span className="truncate">Subject:</span>
          </span>
          <span className="font-bold text-foreground text-xs truncate ml-1">
            {selectedSubjectMeta.icon} {selectedSubjectMeta.label}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStep(2)}
          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer border ${
            step === 2
              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30 shadow-sm"
              : "border-border/70 bg-surface/60 text-muted-foreground hover:text-foreground hover:bg-surface-2"
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              2
            </span>
            <span className="truncate">Class:</span>
          </span>
          <span className="font-bold text-foreground text-xs truncate ml-1">
            {selectedClassMeta.icon} {selectedClassMeta.label}
          </span>
        </button>
      </div>
    </div>
  );

  const uploadBody = (
    <div className="space-y-3.5">
      {/* File input (if uploading from disk in Global Library) */}
      {onFileChange && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span>PDF Document</span>
          </label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                onFileChange(file);
                setCustomFileName(file.name);
              }
            }}
            className="w-full rounded-xl border border-border bg-surface p-2 text-xs text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />
        </div>
      )}

      {/* STEP 1: Select Subject */}
      {step === 1 && (
        <div className="space-y-2 animate-in fade-in duration-150">
          <label className="text-xs font-bold text-foreground">Select Subject</label>
          <div className="grid grid-cols-2 gap-2">
            {UPLOAD_CATEGORIES.map((cat) => {
              const isSelected = uploadCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onCategoryChange(cat.id);
                    setStep(2);
                  }}
                  className={`group flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/15 ring-1 ring-primary shadow-sm text-foreground"
                      : "border-border/70 bg-surface/70 hover:border-primary/40 hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">{cat.icon}</span>
                    <span className="font-semibold text-xs text-foreground truncate">{cat.label}</span>
                  </div>
                  {isSelected && (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: Select Class */}
      {step === 2 && (
        <div className="space-y-2 animate-in fade-in duration-150">
          <label className="text-xs font-bold text-foreground">Select Class</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {UPLOAD_EDUCATION_LEVELS.map((lvl) => {
              const isSelected = uploadEducationLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onEducationLevelChange(lvl.id)}
                  className={`group flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/15 ring-1 ring-primary shadow-sm text-foreground"
                      : "border-border/70 bg-surface/70 hover:border-primary/40 hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{lvl.icon}</span>
                    <span className="font-semibold text-xs text-foreground truncate">{lvl.label}</span>
                  </div>
                  {isSelected && (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Target R2 Path Hierarchy with Editable Filename */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-1.5 text-foreground">
            <FolderTree className="h-3.5 w-3.5 text-primary" />
            <span>Target R2 Path</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-normal">Editable filename</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center rounded-xl border border-border/80 bg-black/40 overflow-hidden shadow-inner focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40 transition-all">
          <div className="bg-white/[0.04] px-3 py-2 font-mono text-xs text-muted-foreground/90 shrink-0 border-b sm:border-b-0 sm:border-r border-border/40 select-none flex items-center gap-1">
            <span>{folderPrefix}</span>
          </div>
          <div className="relative flex-1 flex items-center min-w-0">
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              placeholder="filename.pdf"
              className="w-full bg-transparent px-3 py-2 font-mono text-xs text-emerald-400 placeholder:text-muted-foreground/40 focus:outline-none"
              spellCheck={false}
            />
            {customFileName !== initialFileName && (
              <button
                type="button"
                onClick={() => setCustomFileName(initialFileName)}
                title="Reset filename"
                className="mr-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-surface border border-border/60 hover:bg-surface-2 transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const uploadFooter = (
    <div className="flex items-center justify-between gap-2 w-full pt-1">
      {step === 2 ? (
        <button
          type="button"
          onClick={() => setStep(1)}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      )}

      <div className="flex items-center gap-2">
        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer shadow-md shadow-primary/20"
          >
            <span>Next: Class</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSubmit(finalFileName)}
            disabled={!isFileReady || uploadingDirect}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-md shadow-primary/20"
          >
            {uploadingDirect ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <CloudUpload className="h-3.5 w-3.5" />
                <span>Upload Document</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="sr-only">Upload to Cloudflare R2</DrawerTitle>
            {dialogHeaderContent}
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
        <DialogHeader>{dialogHeaderContent}</DialogHeader>
        <div className="py-1">{uploadBody}</div>
        <DialogFooter>{uploadFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

