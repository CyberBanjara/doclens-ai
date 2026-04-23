import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Library } from "@/components/Library";
import { SettingsPanel } from "@/components/SettingsPanel";
import { setSetting, settingsKeys, getSetting } from "@/lib/storage";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: LibraryPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "DocLens — client-side PDF intelligence" },
      {
        name: "description",
        content:
          "DocLens is a privacy-first, browser-only PDF library and AI workspace. Upload PDFs, extract clean text, and run them through any OpenRouter model — nothing leaves your browser except your direct API call.",
      },
      { property: "og:title", content: "DocLens — client-side PDF intelligence" },
      {
        property: "og:description",
        content: "Browser-only PDF library + OpenRouter AI workspace. No server, no uploads.",
      },
    ],
  }),
});

function LibraryPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    getSetting<string>(settingsKeys.lastModelId).then((v) => setSelectedModel(v ?? ""));
  }, [settingsOpen]);

  const onSelectModel = async (id: string) => {
    setSelectedModel(id);
    await setSetting(settingsKeys.lastModelId, id);
  };

  return (
    <>
      <Library onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
      />
    </>
  );
}
