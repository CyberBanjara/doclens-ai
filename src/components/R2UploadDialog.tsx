import { useState, useEffect } from "react";
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
import { UPLOAD_CATEGORIES, UPLOAD_EDUCATION_LEVELS } from "@/lib/uploadCategories";
import { ArrowLeft, ArrowRight, Check, CloudUpload, FileText, FolderTree } from "lucide-react";

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
  onSubmit: () => void;
}

/** 2-Step (Subject -> Class) Upload-to-R2 modal with folder hierarchy preview. */
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

  // Reset to Step 1 whenever modal opens
  useEffect(() => {
    if (open) {
      setStep(1);
    }
  }, [open]);

  const activeFileName = existingDocFileName || uploadFile?.name || "document.pdf";
  const selectedSubjectMeta =
    UPLOAD_CATEGORIES.find((c) => c.id === uploadCategory) || UPLOAD_CATEGORIES[0];
  const selectedClassMeta =
    UPLOAD_EDUCATION_LEVELS.find((l) => l.id === uploadEducationLevel) || UPLOAD_EDUCATION_LEVELS[1];

  // Generated path hierarchy preview
  const previewPath =
    uploadEducationLevel && uploadEducationLevel !== "general"
      ? `${uploadCategory}/${uploadEducationLevel}/${activeFileName}`
      : `${uploadCategory}/${activeFileName}`;

  const isFileReady = Boolean(existingDocFileName || uploadFile);

  const dialogHeaderContent = (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <CloudUpload className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Upload to Cloudflare R2</h3>
            <p className="text-xs text-muted-foreground">
              {step === 1
                ? "Step 1: Choose the subject category for this document"
                : "Step 2: Choose the class or target education tier"}
            </p>
          </div>
        </div>
      </div>

      {/* Step Pills & Progress Indicator */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex-1 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer border ${
            step === 1
              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30 shadow-sm"
              : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              1
            </span>
            <span className="truncate">Subject:</span>
          </div>
          <span className="font-bold text-foreground text-[11px] truncate ml-1">
            {selectedSubjectMeta.icon} {selectedSubjectMeta.label}
          </span>
        </button>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <button
          type="button"
          onClick={() => setStep(2)}
          className={`flex-1 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer border ${
            step === 2
              ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30 shadow-sm"
              : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              2
            </span>
            <span className="truncate">Class:</span>
          </div>
          <span className="font-bold text-foreground text-[11px] truncate ml-1">
            {selectedClassMeta.icon} {selectedClassMeta.label}
          </span>
        </button>
      </div>
    </div>
  );

  const uploadBody = (
    <div className="space-y-4">
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
                onFileChange(e.target.files[0]);
              }
            }}
            className="w-full rounded-xl border border-border bg-surface p-2 text-xs text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />
        </div>
      )}

      {/* STEP 1: Select Subject */}
      {step === 1 && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground">Select Subject Category</label>
            <span className="text-[10px] font-medium text-muted-foreground">
              Click to select and proceed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  className={`group flex items-start gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm text-foreground"
                      : "border-border bg-surface/70 hover:border-primary/40 hover:bg-surface-2 text-muted-foreground"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl shadow-inner border border-border/60 transition-transform group-hover:scale-105">
                    {cat.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">{cat.label}</span>
                      {isSelected && (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{cat.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: Select Class */}
      {step === 2 && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground">Select Class / Grade Level</label>
            <span className="text-[10px] font-medium text-muted-foreground">
              Assigned to: {selectedSubjectMeta.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {UPLOAD_EDUCATION_LEVELS.map((lvl) => {
              const isSelected = uploadEducationLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onEducationLevelChange(lvl.id)}
                  className={`group flex flex-col items-start rounded-2xl border p-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm text-foreground"
                      : "border-border bg-surface/70 hover:border-primary/40 hover:bg-surface-2 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-base">{lvl.icon}</span>
                    {isSelected && (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-xs text-foreground mt-1">{lvl.label}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{lvl.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Generated File Hierarchy Preview Box */}
      <div className="rounded-2xl border border-border/80 bg-surface/50 p-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FolderTree className="h-3.5 w-3.5 text-primary" />
            <span>Target R2 Path Hierarchy</span>
          </div>
          <span className="font-mono text-[10px] text-primary/80">Direct Structure</span>
        </div>
        <div className="rounded-xl bg-black/40 border border-border/50 px-3 py-2 font-mono text-[11px] text-emerald-400 truncate select-all">
          {previewPath}
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
          <span>Change Subject</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors cursor-pointer"
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
            onClick={onSubmit}
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
          <DrawerHeader className="pb-2">{dialogHeaderContent}</DrawerHeader>
          <div className="overflow-y-auto px-6 pb-2">{uploadBody}</div>
          <DrawerFooter>{uploadFooter}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>{dialogHeaderContent}</DialogHeader>
        <div className="py-1">{uploadBody}</div>
        <DialogFooter>{uploadFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
