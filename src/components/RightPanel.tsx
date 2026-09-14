import { useEffect, useRef, useState } from "react";
import type { PageAiSummaryEntry, PageDataRecord } from "@/lib/storage";
import { getPageData } from "@/lib/storage";
import { PageWorkstation } from "./PageWorkstation";
import { useTts, type TtsSource } from "@/context/TtsContext";
import { TtsPlayer } from "./TtsPlayer";
import { VoiceOnboardingDialog } from "./VoiceOnboardingDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { listenDocEvent, dispatchDocEvent } from "@/lib/docEvents";
import { useAiTabAutoPlay } from "@/hooks/useAiTabAutoPlay";
import { MobileReaderSheet } from "@/components/MobileReaderSheet";
import { ExportMenu } from "@/components/ExportMenu";
import { ExtractedPageRow } from "@/components/ExtractedPageRow";

interface Props {
  docId: string;
  pageCount: number;
  analyzing: boolean;
  status: string;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
  /** Mobile-only: controls the reader bottom sheet from the floating bottom
   * bar's "Read" button. Ignored on desktop. */
  mobileReaderOpen?: boolean;
  onMobileReaderOpenChange?: (open: boolean) => void;
}

type Tab = "ai" | "text";

export function RightPanel({
  docId,
  pageCount,
  analyzing,
  status,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
  mobileReaderOpen = false,
  onMobileReaderOpenChange,
}: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("ai");
  const [activePageData, setActivePageData] = useState<PageDataRecord | null>(null);

  const { isPlaying, activePageNumber, currentTextSource, continuousPlay, play, stop } = useTts();

  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const voiceReadyCallbackRef = useRef<(() => void) | null>(null);
  const requestVoiceOnboarding = (onReady: () => void) => {
    voiceReadyCallbackRef.current = onReady;
    setVoiceDialogOpen(true);
  };

  // Load the active page data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPageData(docId, activePage);
      if (cancelled) return;
      setActivePageData(p ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, activePage, aiSummary]);

  // Handle continuous play page transition event
  useEffect(() => {
    return listenDocEvent("doclens:tts-next-page", (d) => {
      if (d.currentPage === activePage) {
        if (activePage < pageCount) {
          setActivePage(activePage + 1);
        } else {
          stop();
        }
      }
    });
  }, [activePage, pageCount, setActivePage, stop]);

  // Seamless continuous play auto-read across pages for both AI Assistant and Original Text
  useAiTabAutoPlay({
    docId,
    activePage,
    activePageData,
    tab,
    pageCount,
    analyzing,
    isPlaying,
    continuousPlay,
    activePageNumber,
    currentTextSource,
    play,
    stop,
    requestVoiceOnboarding,
  });

  const textToRead = tab === "ai" ? activePageData?.pageAi?.result : activePageData?.text;
  const source: TtsSource = tab === "ai" ? "ai" : "original";

  // Shared between desktop and mobile — always mounted (CSS-hidden rather
  // than unmounted) so background AI generation and the
  // doclens:ensure-page-ready listener survive switching to the "Original
  // Text" tab / the reader sheet being closed on mobile — see the auto-read
  // orchestration in useAiTabAutoPlay.
  const body = (
    <div className="flex-1 overflow-hidden">
      <div className={`h-full ${tab === "ai" ? "" : "hidden"}`}>
        <PageWorkstation
          docId={docId}
          pageCount={pageCount}
          analyzing={analyzing}
          aiSummary={aiSummary}
          onPageAiChange={onPageAiChange}
          activePage={activePage}
          setActivePage={setActivePage}
        />
      </div>

      {tab === "text" && (
        <ExtractedTextTab docId={docId} activePage={activePage} aiSummary={aiSummary} />
      )}
    </div>
  );

  const player = pageCount > 0 && activePageData && (
    <TtsPlayer
      text={textToRead}
      source={source}
      pageNumber={activePage}
      onNeedsVoiceOnboarding={requestVoiceOnboarding}
    />
  );

  const voiceDialog = (
    <VoiceOnboardingDialog
      open={voiceDialogOpen}
      onOpenChange={setVoiceDialogOpen}
      onReady={() => {
        const cb = voiceReadyCallbackRef.current;
        voiceReadyCallbackRef.current = null;
        cb?.();
      }}
    />
  );

  if (isMobile) {
    return (
      <MobileReaderSheet
        mobileReaderOpen={mobileReaderOpen}
        onMobileReaderOpenChange={onMobileReaderOpenChange}
        tab={tab}
        setTab={setTab}
        analyzing={analyzing}
        body={body}
        player={player}
        voiceDialog={voiceDialog}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface/30">
      {/* ─── Tab bar ─── */}
      <div className="flex items-center border-b border-border bg-surface/50 backdrop-blur-sm">
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          AI Assistant
        </TabButton>
        <TabButton active={tab === "text"} onClick={() => setTab("text")}>
          Original Text
        </TabButton>

        <div className="ml-auto flex items-center gap-1 px-3">
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-primary border-t-transparent spin-slow" />
              {status}
            </span>
          )}

          {pageCount > 0 && <ExportMenu docId={docId} />}
        </div>
      </div>

      {body}

      {/* Sticky bottom TTS Player */}
      {player && (
        <div className="border-t border-border bg-surface/40 px-4 pb-4 pt-2 shrink-0">{player}</div>
      )}

      {voiceDialog}
    </div>
  );
}

/* ---------- Extracted text tab — single active page ---------- */

function ExtractedTextTab({
  docId,
  activePage,
  aiSummary,
}: {
  docId: string;
  activePage: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
}) {
  if (activePage <= 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 py-4">
        <div className="max-w-sm text-center text-sm text-muted-foreground">
          Select a page to view its extracted text.
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto overscroll-contain px-6 py-5 page-card-enter"
      key={activePage}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, select, textarea, input, [role='button']")) return;
        dispatchDocEvent("doclens:scroll-to-pdf", { pageNumber: activePage });
      }}
    >
      <ExtractedPageRow docId={docId} pageNumber={activePage} summary={aiSummary[activePage]} />
    </div>
  );
}

/* ---------- Shared UI primitives ---------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-primary" />}
    </button>
  );
}
