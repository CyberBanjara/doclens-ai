import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { EXPLANATION_STYLES, type ExplanationStyle } from "@/lib/openrouter";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  open: boolean;
  language: string;
  style: ExplanationStyle;
  onOpenChange: (open: boolean) => void;
  onConfirm: (settings: { language: string; style: ExplanationStyle }) => void;
}

const QUICK_LANGS = [
  "हिंदी",
  "বাংলা",
  "తెలుగు",
  "മലയാളം",
  "English",
  "Spanish",
  "French",
  "Japanese",
];

export function ExplainSetupDialog({ open, language, style, onOpenChange, onConfirm }: Props) {
  const isMobile = useIsMobile();
  const [selectedLanguage, setSelectedLanguage] = useState(language || "English");
  const [customLanguage, setCustomLanguage] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<ExplanationStyle>(style || "Standard");

  const finalLanguage = useMemo(() => {
    return customLanguage.trim() || selectedLanguage;
  }, [customLanguage, selectedLanguage]);

  const confirm = () => {
    onConfirm({ language: finalLanguage, style: selectedStyle });
  };

  const body = (
    <>
      <div className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          mother tongue / language
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_LANGS.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                setSelectedLanguage(lang);
                setCustomLanguage("");
              }}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                !customLanguage.trim() && selectedLanguage === lang
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
        <input
          value={customLanguage}
          onChange={(e) => setCustomLanguage(e.target.value)}
          placeholder="Custom mother tongue..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="mt-5 space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          explanation style
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXPLANATION_STYLES.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedStyle(item.id)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                selectedStyle === item.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-surface-2"
              }`}
            >
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {item.instruction}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Set explanation preferences</DrawerTitle>
            <DrawerDescription>
              Choose your mother tongue and explanation style for this document.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-6 pb-2">{body}</div>
          <DrawerFooter>
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={!finalLanguage}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Continue
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-[720px]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background px-6 py-5">
          <DialogHeader className="min-w-0 flex-1 pr-2">
            <DialogTitle>Set explanation preferences</DialogTitle>
            <DialogDescription>
              Choose your mother tongue and explanation style for this document.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-shrink-0 items-center gap-2 pr-7">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={!finalLanguage}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-88px)] overflow-auto px-6 py-5">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
