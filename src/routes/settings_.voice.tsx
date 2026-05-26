import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SidebarLayout } from "@/components/SidebarLayout";
import { getOutputLanguage, setOutputLanguage } from "@/lib/openrouter";
import {
  createSmartTtsController,
  downloadPiperVoice,
  getFavorites,
  getTtsEngine,
  getTtsPitch,
  getTtsRate,
  getTtsVoiceFor,
  isTtsSupported,
  listInstalledPiperVoices,
  listPiperVoices,
  listVoices,
  type PiperVoiceMeta,
  removePiperVoice,
  setTtsEngine,
  setTtsPitch,
  setTtsRate,
  setTtsVoiceFor,
  testPiperVoice,
  toggleFavorite,
  type TtsEngine,
} from "@/lib/tts";

export const Route = createFileRoute("/settings_/voice")({
  component: VoicePage,
  head: () => ({ meta: [{ title: "DocLens — Voice Settings" }] }),
});

/* ---------- Comprehensive language list ---------- */

const ALL_LANGUAGES = [
  "Afrikaans", "Albanian", "Amharic", "Arabic", "Armenian",
  "Assamese", "Azerbaijani", "Bangla", "Basque", "Belarusian",
  "Bodo", "Bosnian", "Bulgarian", "Burmese", "Cantonese",
  "Catalan", "Chinese", "Croatian", "Czech", "Danish",
  "Dutch", "English", "Estonian", "Filipino", "Finnish",
  "French", "Galician", "Georgian", "German", "Greek",
  "Gujarati", "Hausa", "Hebrew", "Hindi", "Hungarian",
  "Icelandic", "Igbo", "Indonesian", "Irish", "Italian",
  "Japanese", "Javanese", "Kannada", "Kazakh", "Khmer",
  "Korean", "Kurdish", "Kyrgyz", "Lao", "Latvian",
  "Lithuanian", "Macedonian", "Malay", "Malayalam", "Maltese",
  "Manipuri", "Marathi", "Mongolian", "Nepali", "Norwegian",
  "Odia", "Pashto", "Persian", "Polish", "Portuguese",
  "Punjabi", "Romanian", "Russian", "Sanskrit", "Serbian",
  "Sindhi", "Sinhala", "Slovak", "Slovenian", "Somali",
  "Spanish", "Sundanese", "Swahili", "Swedish", "Tamil",
  "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu",
  "Uzbek", "Vietnamese", "Welsh", "Yoruba", "Zulu",
];

const LANG_CODE_MAP: Record<string, string> = {
  afrikaans: "af", albanian: "sq", amharic: "am", arabic: "ar", armenian: "hy",
  assamese: "as", azerbaijani: "az", bangla: "bn", basque: "eu", belarusian: "be",
  bodo: "brx", bosnian: "bs", bulgarian: "bg", burmese: "my", cantonese: "yue",
  catalan: "ca", chinese: "zh", croatian: "hr", czech: "cs", danish: "da",
  dutch: "nl", english: "en", estonian: "et", filipino: "fil", finnish: "fi",
  french: "fr", galician: "gl", georgian: "ka", german: "de", greek: "el",
  gujarati: "gu", hausa: "ha", hebrew: "he", hindi: "hi", hungarian: "hu",
  icelandic: "is", igbo: "ig", indonesian: "id", irish: "ga", italian: "it",
  japanese: "ja", javanese: "jv", kannada: "kn", kazakh: "kk", khmer: "km",
  korean: "ko", kurdish: "ku", kyrgyz: "ky", lao: "lo", latvian: "lv",
  lithuanian: "lt", macedonian: "mk", malay: "ms", malayalam: "ml", maltese: "mt",
  manipuri: "mni", marathi: "mr", mongolian: "mn", nepali: "ne", norwegian: "no",
  odia: "or", pashto: "ps", persian: "fa", polish: "pl", portuguese: "pt",
  punjabi: "pa", romanian: "ro", russian: "ru", sanskrit: "sa", serbian: "sr",
  sindhi: "sd", sinhala: "si", slovak: "sk", slovenian: "sl", somali: "so",
  spanish: "es", sundanese: "su", swahili: "sw", swedish: "sv", tamil: "ta",
  telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur",
  uzbek: "uz", vietnamese: "vi", welsh: "cy", yoruba: "yo", zulu: "zu",
};

function langCode(label: string): string {
  return LANG_CODE_MAP[label.toLowerCase()] ?? label.toLowerCase();
}

/* ---------- Sample text per language ---------- */

function sampleFor(language: string): string {
  const m: Record<string, string> = {
    English: "The quick brown fox jumps over the lazy dog.",
    Arabic: "النص السريع لاختبار الصوت.",
    French: "Bonjour, ceci est un test de la voix.",
    Hindi: "यह आवाज़ का परीक्षण है।",
    Spanish: "Hola, esta es una prueba de voz.",
    Japanese: "これは音声テストです。",
    German: "Dies ist ein Sprachtest.",
    Italian: "Questo è un test vocale.",
    Portuguese: "Este é um teste de voz.",
    Russian: "Это тест голоса.",
    Chinese: "这是一个语音测试。",
    Korean: "이것은 음성 테스트입니다.",
    Telugu: "ఇది వాయిస్ పరీక్ష.",
    Tamil: "இது குரல் சோதனை.",
    Kannada: "ಇದು ಧ್ವನಿ ಪರೀಕ್ಷೆ.",
    Malayalam: "ഇത് ശബ്ദ പരീക്ഷണമാണ്.",
    Bengali: "এটি একটি ভয়েস পরীক্ষা।",
    Bangla: "এটি একটি ভয়েস পরীক্ষা।",
    Marathi: "हे आवाज चाचणी आहे.",
    Gujarati: "આ અવાજ પરીક્ષણ છે.",
    Urdu: "یہ آواز کا ٹیسٹ ہے۔",
    Turkish: "Bu bir ses testidir.",
    Dutch: "Dit is een stemtest.",
    Polish: "To jest test głosu.",
    Swedish: "Det här är ett rösttest.",
    Thai: "นี่คือการทดสอบเสียง",
    Vietnamese: "Đây là bài kiểm tra giọng nói.",
    Indonesian: "Ini adalah tes suara.",
  };
  return m[language] ?? "This is a voice test.";
}

/* ---------- Component ---------- */

function VoicePage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [language, setLanguage] = useState("English");
  const [selected, setSelected] = useState("");
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"matching" | "all">("matching");
  const [search, setSearch] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [ttsRate, setTtsRateLocal] = useState(1);
  const [ttsPitch, setTtsPitchLocal] = useState(1);
  const [engine, setEngineLocal] = useState<TtsEngine>("auto");
  const [piperVoices, setPiperVoices] = useState<PiperVoiceMeta[] | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [dlProgress, setDlProgress] = useState(0);
  const [showPiperCatalog, setShowPiperCatalog] = useState(false);
  const [piperSearch, setPiperSearch] = useState("");
  const [preferredPiper, setPreferredPiper] = useState<string>("");
  const [testingPiper, setTestingPiper] = useState<string | null>(null);

  // Initialize from stored settings
  useEffect(() => {
    setLanguage(getOutputLanguage() || "English");
    setFavs(new Set(getFavorites()));
    setTtsRateLocal(getTtsRate());
    setTtsPitchLocal(getTtsPitch());
    setEngineLocal(getTtsEngine());
    setPreferredPiper(localStorage.getItem("doclens.piper.preferredVoice") ?? "");
    void refreshInstalled();
  }, []);

  async function refreshInstalled() {
    const ids = await listInstalledPiperVoices();
    setInstalled(ids);
  }

  async function openPiperCatalog() {
    setShowPiperCatalog(true);
    if (piperVoices) return;
    try {
      const list = await listPiperVoices();
      setPiperVoices(list);
    } catch (e) {
      toast.error("Failed to load voice catalog.");
      console.error(e);
    }
  }

  async function handleInstallPiper(v: PiperVoiceMeta) {
    setDownloading(v.key);
    setDlProgress(0);
    try {
      await downloadPiperVoice(v.key, (loaded, total) => {
        setDlProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
      });
      await refreshInstalled();
      // Mark installed in catalog cache
      if (piperVoices) {
        setPiperVoices(piperVoices.map((p) => p.key === v.key ? { ...p, installed: true } : p));
      }
      toast.success(`Installed ${v.name} (${v.language.name_english})`);
    } catch (e) {
      toast.error(`Install failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setDownloading(null);
      setDlProgress(0);
    }
  }

  async function handleRemovePiper(voiceId: string) {
    try {
      await removePiperVoice(voiceId);
      await refreshInstalled();
      if (piperVoices) {
        setPiperVoices(piperVoices.map((p) => p.key === voiceId ? { ...p, installed: false } : p));
      }
      if (preferredPiper === voiceId) {
        localStorage.removeItem("doclens.piper.preferredVoice");
        setPreferredPiper("");
      }
      toast.success(`Removed ${voiceId}`);
    } catch (e) {
      toast.error(`Remove failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  function handleSetPreferredPiper(voiceId: string) {
    if (voiceId) localStorage.setItem("doclens.piper.preferredVoice", voiceId);
    else localStorage.removeItem("doclens.piper.preferredVoice");
    setPreferredPiper(voiceId);
  }

  async function handleTestPiper(voiceId: string) {
    if (testingPiper === voiceId) return;
    setTestingPiper(voiceId);
    try {
      await testPiperVoice(voiceId);
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setTestingPiper(null);
    }
  }

  // Update selected voice when language changes
  useEffect(() => {
    setSelected(getTtsVoiceFor(language));
  }, [language]);

  // Load system voices
  useEffect(() => {
    if (!isTtsSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, []);

  // Filtered & sorted voice list
  const sorted = useMemo(() => {
    const code = langCode(language).toLowerCase();
    let list = voices.slice();
    if (filter === "matching") {
      list = list.filter((v) => v.lang.toLowerCase().startsWith(code));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.lang.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const fa = favs.has(a.name) ? 0 : 1;
      const fb = favs.has(b.name) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const ma = a.lang.toLowerCase().startsWith(code) ? 0 : 1;
      const mb = b.lang.toLowerCase().startsWith(code) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return a.name.localeCompare(b.name);
    });
  }, [voices, favs, language, filter, search]);

  // Filtered language list for picker
  const filteredLangs = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    if (!q) return ALL_LANGUAGES;
    return ALL_LANGUAGES.filter((l) => l.toLowerCase().includes(q));
  }, [langSearch]);

  // Count of matching voices per language
  const matchingCount = useMemo(() => {
    const code = langCode(language).toLowerCase();
    return voices.filter((v) => v.lang.toLowerCase().startsWith(code)).length;
  }, [voices, language]);

  const handlePick = (name: string) => {
    setSelected(name);
    setTtsVoiceFor(language, name);
    toast.success(`Voice set to "${name}" for ${language}.`);
  };

  const handleStar = (name: string) => {
    toggleFavorite(name);
    setFavs(new Set(getFavorites()));
  };

  const handleLanguageChange = (l: string) => {
    setLanguage(l);
    setOutputLanguage(l);
    setShowLangPicker(false);
    setLangSearch("");
  };

  const handlePreview = (v: SpeechSynthesisVoice) => {
    if (previewing === v.name) {
      window.speechSynthesis?.cancel();
      setPreviewing(null);
      return;
    }
    window.speechSynthesis?.cancel();
    const sample = sampleFor(language);
    const prev = getTtsVoiceFor(language);
    setTtsVoiceFor(language, v.name);
    const ctrl = createSmartTtsController(sample, {
      language,
      onState: (s: "idle" | "playing" | "paused" | "ended") => {
        if (s === "ended" || s === "idle") setPreviewing(null);
      },
    });
    ctrl.play();
    setPreviewing(v.name);
    setTtsVoiceFor(language, prev);
  };

  return (
    <SidebarLayout pageTitle="Voices">
      <div className="mx-auto w-full max-w-4xl px-8 py-6">

        {/* Language selector card */}
        <section className="mb-5 rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                document language
              </div>
              <div className="mt-1 text-xl font-semibold text-primary">{language}</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {matchingCount} voice{matchingCount !== 1 ? "s" : ""} available
              </div>
            </div>
            <button
              onClick={() => setShowLangPicker(true)}
              className="rounded-md bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
            >
              change language
            </button>
          </div>
        </section>

        {/* Neural Voice Models (Piper) */}
        <section className="mb-5 rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">neural voice models</div>
              <div className="mt-1 text-sm text-foreground">
                Offline Piper voices · Brave-safe · {installed.length} installed
              </div>
            </div>
            <button
              onClick={openPiperCatalog}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              browse catalog
            </button>
          </div>

          {/* Engine preference */}
          <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>engine</span>
            {(["auto", "neural", "browser"] as TtsEngine[]).map((e) => (
              <button
                key={e}
                onClick={() => { setTtsEngine(e); setEngineLocal(e); }}
                className={`rounded px-2 py-0.5 ${engine === e ? "bg-primary/15 text-primary" : "border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {e}
              </button>
            ))}
          </div>

          {installed.length === 0 ? (
            <div className="rounded border border-dashed border-border bg-background/40 px-4 py-3 font-mono text-[11px] text-muted-foreground">
              No neural voices installed. Click "browse catalog" to download a Piper voice (~20–60 MB each, cached offline).
            </div>
          ) : (
            <ul className="divide-y divide-border rounded border border-border">
              {installed.map((id) => {
                const meta = piperVoices?.find((v) => v.key === id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="radio"
                      name="preferred-piper"
                      checked={preferredPiper === id}
                      onChange={() => handleSetPreferredPiper(id)}
                      className="accent-primary"
                      aria-label="Set preferred"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-mono text-[12px] text-foreground">{id}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{meta?.language.name_english || ""}</div>
                    </div>
                    <button
                      onClick={() => handleTestPiper(id)}
                      disabled={testingPiper === id}
                      className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
                    >
                      {testingPiper === id ? "⏳" : "▶"} test
                    </button>
                    <button
                      onClick={() => handleRemovePiper(id)}
                      className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                    >
                      remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Rate and Pitch controls */}
        <section className="mb-5 rounded-lg border border-border bg-surface p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                speed · <span className="text-primary">{ttsRate.toFixed(2)}×</span>
              </span>
              <input
                type="range" min={0.25} max={4} step={0.05}
                value={ttsRate}
                onChange={(e) => { const v = parseFloat(e.target.value); setTtsRateLocal(v); setTtsRate(v); }}
                className="mt-2 w-full accent-primary"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0.25×</span><span>1× normal</span><span>4×</span>
              </div>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                pitch · <span className="text-primary">{ttsPitch.toFixed(2)}</span>
              </span>
              <input
                type="range" min={0} max={2} step={0.05}
                value={ttsPitch}
                onChange={(e) => { const v = parseFloat(e.target.value); setTtsPitchLocal(v); setTtsPitch(v); }}
                className="mt-2 w-full accent-primary"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0 low</span><span>1 normal</span><span>2 high</span>
              </div>
            </label>
          </div>
        </section>

        {/* Filter + search */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
            <button
              onClick={() => setFilter("matching")}
              className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                filter === "matching" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              matching ({matchingCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                filter === "all" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              all voices ({voices.length})
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search voices…"
            className="ml-auto w-56 rounded-md border border-border bg-surface px-3 py-1 font-mono text-[12px] outline-none focus:border-primary"
          />
        </div>

        {/* Not supported warning */}
        {!isTtsSupported() && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 font-mono text-[12px] text-destructive">
            ⚠ Web Speech API is not available in this browser. TTS features will not work.
          </div>
        )}

        {/* Voice list */}
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {sorted.length === 0 && (
            <li className="px-5 py-10 text-center">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                no voices found{filter === "matching" ? ` for ${language}` : ""}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {filter === "matching"
                  ? "Try switching to 'All voices' or choose a different language."
                  : "Your browser doesn't have any voices installed."}
              </p>
            </li>
          )}
          {sorted.map((v) => {
            const isSel = selected === v.name;
            const isFav = favs.has(v.name);
            const playing = previewing === v.name;
            return (
              <li key={v.name + v.lang}>
                <div
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                    isSel ? "bg-primary/5" : "hover:bg-background/40"
                  }`}
                >
                  {/* Radio button */}
                  <button
                    onClick={() => handlePick(v.name)}
                    aria-label={isSel ? "Selected" : "Select"}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSel ? "border-primary" : "border-border hover:border-foreground/50"
                    }`}
                  >
                    {isSel && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </button>

                  {/* Voice info */}
                  <button
                    onClick={() => handlePick(v.name)}
                    className="flex flex-1 flex-col items-start text-left min-w-0"
                  >
                    <div className="w-full truncate text-[14px] font-medium text-foreground">
                      {v.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <span>{formatVoiceInfo(v)}</span>
                    </div>
                  </button>

                  {/* Star */}
                  <button
                    onClick={() => handleStar(v.name)}
                    aria-label={isFav ? "Unfavorite" : "Favorite"}
                    className={`flex-shrink-0 text-lg leading-none transition-colors ${
                      isFav ? "text-yellow-400 hover:text-yellow-500" : "text-muted-foreground/40 hover:text-foreground"
                    }`}
                  >
                    {isFav ? "★" : "☆"}
                  </button>

                  {/* Preview */}
                  <button
                    onClick={() => handlePreview(v)}
                    className={`flex-shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      playing
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {playing ? "■ stop" : "▶ test"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          Selection is saved per language. Tap ▶ test to preview without changing your choice.
          Voice availability depends on your browser and operating system.
        </p>
      </div>

      {/* Language picker modal */}
      {showLangPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setShowLangPicker(false); setLangSearch(""); }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Specify language</h3>
                <button
                  onClick={() => { setShowLangPicker(false); setLangSearch(""); }}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <input
                autoFocus
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                placeholder="Search languages…"
                className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Language list */}
            <ul className="flex-1 divide-y divide-border overflow-auto">
              {filteredLangs.map((l) => {
                const isActive = language === l;
                return (
                  <li key={l}>
                    <button
                      onClick={() => handleLanguageChange(l)}
                      className={`flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-background/60"
                      }`}
                    >
                      <span className="text-[15px] font-medium">{l}</span>
                      {isActive && (
                        <span className="text-sm text-primary">✓</span>
                      )}
                    </button>
                  </li>
                );
              })}
              {filteredLangs.length === 0 && (
                <li className="px-5 py-8 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  no languages match "{langSearch}"
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Piper catalog modal */}
      {showPiperCatalog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPiperCatalog(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Piper neural voices</h3>
                <button onClick={() => setShowPiperCatalog(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <input
                value={piperSearch}
                onChange={(e) => setPiperSearch(e.target.value)}
                placeholder="Search voices…"
                className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <ul className="flex-1 divide-y divide-border overflow-auto">
              {piperVoices === null && (
                <li className="px-5 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">loading catalog…</li>
              )}
              {piperVoices?.filter((v) => {
                const q = piperSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  v.key.toLowerCase().includes(q) ||
                  v.name.toLowerCase().includes(q) ||
                  v.language.name_english.toLowerCase().includes(q) ||
                  v.language.name_native.toLowerCase().includes(q) ||
                  v.language.country_english.toLowerCase().includes(q)
                );
              }).map((v) => (
                <li key={v.key} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-mono text-[12px] text-foreground">{v.name} [{v.quality}]</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {v.language.name_native} ({v.language.country_english}) · {v.quality} · {((v.sizeBytes || 0) / 1e6).toFixed(1)} MB
                    </div>
                  </div>
                  {v.installed || installed.includes(v.key) ? (
                    <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">installed</span>
                  ) : downloading === v.key ? (
                    <span className="font-mono text-[10px] text-primary">{dlProgress}%</span>
                  ) : (
                    <button
                      onClick={() => handleInstallPiper(v)}
                      disabled={!!downloading}
                      className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      install
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

    </SidebarLayout>
  );
}

/* ---------- Helpers ---------- */

function formatVoiceInfo(v: SpeechSynthesisVoice): string {
  const type = v.localService ? "Local" : "Online";
  // Extract region info from lang code (e.g. "en-IN" → "India")
  const region = getRegionName(v.lang);
  const parts = [type];
  if (region) parts.push(region);
  if (v.default) parts.push("Default");
  return `${v.lang} · ${parts.join(", ")}`;
}

function getRegionName(langCode: string): string {
  const parts = langCode.split("-");
  if (parts.length < 2) return "";
  const region = parts[1].toUpperCase();
  const regionNames: Record<string, string> = {
    US: "United States", GB: "United Kingdom", AU: "Australia", CA: "Canada",
    IN: "India", NZ: "New Zealand", ZA: "South Africa", IE: "Ireland",
    SG: "Singapore", HK: "Hong Kong", PH: "Philippines", NG: "Nigeria",
    DE: "Germany", AT: "Austria", CH: "Switzerland", FR: "France",
    BE: "Belgium", ES: "Spain", MX: "Mexico", AR: "Argentina",
    CO: "Colombia", CL: "Chile", PE: "Peru", VE: "Venezuela",
    IT: "Italy", PT: "Portugal", BR: "Brazil", RU: "Russia",
    JP: "Japan", KR: "South Korea", CN: "China", TW: "Taiwan",
    SA: "Saudi Arabia", AE: "UAE", EG: "Egypt", IL: "Israel",
    TR: "Turkey", PL: "Poland", NL: "Netherlands", SE: "Sweden",
    NO: "Norway", DK: "Denmark", FI: "Finland", CZ: "Czech Republic",
    GR: "Greece", HU: "Hungary", RO: "Romania", BG: "Bulgaria",
    HR: "Croatia", SK: "Slovakia", UA: "Ukraine", TH: "Thailand",
    VN: "Vietnam", ID: "Indonesia", MY: "Malaysia", PK: "Pakistan",
    BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal", MM: "Myanmar",
  };
  return regionNames[region] ?? region;
}
