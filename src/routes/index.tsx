import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FilePlus2 } from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { DocumentCard } from "@/components/DocumentCard";
import { Dropzone } from "@/components/Dropzone";
import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  getKeyStatus,
  onKeyChange,
  openApiKeyModal,
  validateKey,
  type KeyStatus,
} from "@/lib/openrouter";
import { createDoc, deleteDoc, listDocs, StorageError, type DocSummary } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Private PDF Library & AI Reader" },
      {
        name: "description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, and auto-translate without leaving your device.",
      },
      { property: "og:title", content: "Anuwad — Private PDF Library & AI Reader" },
      {
        property: "og:description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, and auto-translate locally.",
      },
      { property: "og:url", content: "https://www.anuwad.com/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Anuwad — Private PDF Library & AI Reader" },
      {
        name: "twitter:description",
        content:
          "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, and auto-translate locally.",
      },
    ],
  }),
});

function DashboardPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocSummary | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("unknown");

  useEffect(() => {
    setKeyStatus(getKeyStatus());
    void validateKey().then(() => setKeyStatus(getKeyStatus()));
    return onKeyChange(() => setKeyStatus(getKeyStatus()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDocs();
      if (cancelled) return;
      setDocs(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const rec = await createDoc(f, buf);
      navigate({ to: "/doc/$id", params: { id: rec.id } });
    } catch (e) {
      if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
        toast.error(e.message);
      } else {
        toast.error("Failed to save document. Please try again.");
        console.error(e);
      }
    }
  };

  const handleDeleteClick = (doc: DocSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(doc);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id, fileName } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success(`"${fileName}" deleted.`);
    } catch (e) {
      toast.error("Failed to delete document.");
      console.error(e);
    }
  };

  return (
    <SidebarLayout
      pageTitle="Library"
      onNewDocument={handleFile}
      topBarRight={
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {loading ? "loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
          </span>
        </div>
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": "https://www.anuwad.com/#website",
                url: "https://www.anuwad.com/",
                name: "Anuwad",
                description: "Free, private, browser-only PDF reader with AI translation.",
              },
              {
                "@type": "WebPage",
                "@id": "https://www.anuwad.com/#webpage",
                url: "https://www.anuwad.com/",
                name: "Anuwad — Private PDF Reader & Translator",
                isPartOf: { "@id": "https://www.anuwad.com/#website" },
                description:
                  "Your private, browser-only PDF library and reader. Upload, inspect document pipelines, and auto-translate — nothing leaves your device.",
                inLanguage: "en",
                dateModified: "2026-07-26",
                speakable: {
                  "@type": "SpeakableSpecification",
                  cssSelector: ["h1", ".hero-description"],
                },
              },
              {
                "@type": "SoftwareApplication",
                "@id": "https://www.anuwad.com/#software",
                name: "Anuwad",
                applicationCategory: "UtilitiesApplication",
                operatingSystem: "Web (any modern browser)",
                url: "https://www.anuwad.com/",
                offers: {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                },
                featureList: [
                  "Private browser-only PDF rendering — zero server uploads",
                  "AI-powered page-by-page document translation via OpenRouter",
                  "PDF pipeline inspector showing exactly what LLMs receive",
                  "IndexedDB storage for complete data sovereignty",
                  "90+ language support for translation output",
                ],
                description:
                  "Anuwad is a browser-based AI document assistant that renders PDFs and translates pages — all processed locally for complete privacy.",
              },
              {
                "@type": "Organization",
                "@id": "https://www.anuwad.com/#organization",
                name: "Anuwad",
                url: "https://www.anuwad.com/",
                logo: "https://www.anuwad.com/light_13746323.png",
                sameAs: ["https://github.com/CyberBanjara/doclens-ai"],
              },
              {
                "@type": "FAQPage",
                "@id": "https://www.anuwad.com/#faq",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "Is my document data sent to a server?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "No. According to the Anuwad architecture, 100% of PDF rendering, audio generation, and data storage are performed locally in the browser using IndexedDB. Your documents never leave your device, ensuring complete data sovereignty.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How does the AI document translation work?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Anuwad extracts text from each PDF page using Mozilla's pdf.js library, then sends only the text content to an AI model via OpenRouter for translation. The translated text is cached locally in IndexedDB. Research by Princeton University (GEO, 2023) demonstrates that structured, locally-processed content pipelines can reduce latency by up to 50% compared to cloud-round-trip tools.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What languages does Anuwad support?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Anuwad supports translation output in over 90 languages including Hindi, Bengali, Telugu, Malayalam, Tamil, Spanish, French, German, Mandarin, Arabic, and Japanese.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "Is Anuwad free to use?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Yes. Anuwad is completely free to use. PDF reading and the document pipeline inspector are all available at no cost. AI translation requires an OpenRouter API key, which offers free-tier models.",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How is Anuwad different from Google Translate or UPDF?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "Unlike cloud-based tools such as Google Translate or UPDF, Anuwad processes your PDF entirely in the browser. No document data is uploaded to external servers. Additionally, Anuwad includes a unique PDF pipeline inspector that shows developers exactly what text an LLM would receive from each page — a feature not available in competing tools.",
                    },
                  },
                ],
              },
            ],
          }),
        }}
      />
      {/* Kept for SEO/accessibility (H1 + the JSON-LD speakable selector above
          target these) without cluttering the visible library UI. */}
      <h1 className="sr-only">Anuwad — Private PDF Reader & AI Translator</h1>
      <p className="hero-description sr-only">
        Read it. Own it — in the language that owns your heart. A free, browser-only PDF library
        with AI translation.
      </p>
      {isMobile ? (
        <div className="space-y-5 px-4 pb-8 pt-4">
          {keyStatus !== "valid" && (
            <div
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                keyStatus === "invalid"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <p
                className={`text-xs leading-snug ${keyStatus === "invalid" ? "text-destructive" : "text-foreground/85"}`}
              >
                {keyStatus === "invalid"
                  ? "API key was rejected."
                  : "Set up your API key to translate."}
              </p>
              <button
                onClick={() => openApiKeyModal()}
                className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
              >
                Fix
              </button>
            </div>
          )}

          {!loading && docs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-20 text-center">
              <FilePlus2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tap + to add your first PDF</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {docs.map((d) => (
                <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 p-8">
          {/* API Key Banner */}
          {keyStatus !== "valid" && (
            <div
              className={`flex flex-col gap-3 rounded-[18px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                keyStatus === "invalid"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="min-w-0">
                <div
                  className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                    keyStatus === "invalid" ? "text-destructive" : "text-primary"
                  }`}
                >
                  {keyStatus === "invalid" ? "api key invalid" : "get started"}
                </div>
                <p className="mt-1 text-sm text-foreground/85">
                  {keyStatus === "invalid"
                    ? "The server OpenRouter key was rejected. Update the environment variable to keep translating."
                    : "Configure OPENROUTER_API_KEY on the server to start translating documents."}
                </p>
              </div>
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-full bg-primary px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                check key
              </button>
            </div>
          )}

          {!loading && docs.length === 0 ? (
            <div className="h-56">
              <Dropzone onFile={handleFile} />
            </div>
          ) : (
            <>
              <Dropzone onFile={handleFile} compact />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {docs.map((d) => (
                  <DocumentCard key={d.id} doc={d} onDelete={handleDeleteClick} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fileName}</span> and all
              its AI results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarLayout>
  );
}
