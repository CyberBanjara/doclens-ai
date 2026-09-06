import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { ArrowRight, FolderOpen, Globe } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please select a valid PDF file.");
        return;
      }

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
      }
    },
    [navigate],
  );

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

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-16 space-y-10 sm:space-y-12 pb-28 md:pb-16">
        {/* Title / Intro */}
        <div className="space-y-3.5 text-center max-w-xl mx-auto pt-4 sm:pt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary shadow-xs">
            <span>✨ Local AI &amp; Curriculum Reader</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground font-display">
            Anuwad
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed max-w-md mx-auto">
            Read curriculum textbooks and your own documents in your mother tongue.
          </p>
        </div>

        {/* ─── 2-Card Modern Grid (Global Library & Local Library) ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto">
          {/* 1. Global Library */}
          <Link
            to="/global-library"
            className="group relative flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-surface-2/80 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner transition-transform duration-300 group-hover:scale-110">
                  <Globe className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                  NCERT Books
                </span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                  Global Library
                </h2>
                <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
                  Browse and read NCERT curriculum textbooks and study chapters across classes.
                </p>
              </div>
            </div>

            <div className="mt-7 flex items-center gap-1.5 text-xs font-bold text-primary">
              <span>Explore NCERT Books</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* 2. Local Library */}
          <Link
            to="/library"
            className="group relative flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-surface-2/80 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner transition-transform duration-300 group-hover:scale-110">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-surface-2 border border-border px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  Your Uploads
                </span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                  Local Library
                </h2>
                <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
                  Upload your own books and PDFs for private reading, translation, and progress tracking.
                </p>
              </div>
            </div>

            <div className="mt-7 flex items-center gap-1.5 text-xs font-bold text-primary">
              <span>Open My Library</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
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
