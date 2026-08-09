import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, FolderOpen, Globe, Plus, UploadCloud } from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { createDoc, StorageError } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Anuwad — Document Workspace" },
      {
        name: "description",
        content: "Browser-based document reader and translator.",
      },
    ],
  }),
});

function HomePage() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please select a valid PDF file.");
        return;
      }

      setIsProcessing(true);
      const toastId = toast.loading(`Importing "${file.name}"...`);
      try {
        const buf = await file.arrayBuffer();
        const rec = await createDoc(file, buf);
        toast.success(`"${file.name}" ready!`, { id: toastId });
        navigate({ to: "/doc/$id", params: { id: rec.id } });
      } catch (e) {
        if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
          toast.error(e.message, { id: toastId });
        } else {
          toast.error("Failed to process document. Please try again.", { id: toastId });
          console.error(e);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [navigate],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <SidebarLayout pageTitle="Anuwad" onNewDocument={handleProcessFile}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-16 space-y-12 pb-28 md:pb-16">
        {/* Title / Intro */}
        <div className="space-y-3 text-center max-w-xl mx-auto pt-4 sm:pt-8">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground font-display">
            Anuwad
          </h1>
          <p className="text-base text-muted-foreground font-normal leading-relaxed">
            Browser-based document reader & AI translator
          </p>
        </div>

        {/* ─── Three Primary Horizontal Options ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* 1. Global Library */}
          <Link
            to="/global-library"
            className="group flex flex-col justify-between rounded-[18px] border border-border/80 bg-surface/50 p-6 backdrop-blur-md transition-all duration-200 hover:border-primary/60 hover:bg-surface-2/70 active:scale-[0.98] shadow-sm"
          >
            <div className="space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                  Global Library
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Browse community archives, manuscripts, and public books.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-1.5 text-xs font-medium text-primary">
              <span>Open Global Library</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* 2. Local Library */}
          <Link
            to="/library"
            className="group flex flex-col justify-between rounded-[18px] border border-border/80 bg-surface/50 p-6 backdrop-blur-md transition-all duration-200 hover:border-primary/60 hover:bg-surface-2/70 active:scale-[0.98] shadow-sm"
          >
            <div className="space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                  Local Library
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  View your stored documents, reading progress, and page translations.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-1.5 text-xs font-medium text-primary">
              <span>Open Local Library</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* 3. Add New Book / PDF */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group flex flex-col justify-between rounded-[18px] border-2 border-dashed p-6 backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-[0.98] ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10"
            }`}
          >
            <div className="space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                {isProcessing ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <UploadCloud className="h-6 w-6" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                  Add New Book / PDF
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Drop a PDF file here or click to browse and import.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Select PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border/40 pt-8 text-center text-xs text-muted-foreground space-y-2">
          <div className="flex justify-center items-center gap-4 font-medium">
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[11px]">© {new Date().getFullYear()} Anuwad.com</p>
        </footer>
      </div>
    </SidebarLayout>
  );
}
