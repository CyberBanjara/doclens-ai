import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { splitSentences, getBrowserVoices } from "@/lib/tts";
import { toast } from "sonner";
import { initVoiceCache, registerVoicePath, getCachedVoiceIds, downloadVoice as downloadVoiceFromCache, deleteCachedVoice } from "@/lib/voiceCache";
import { getOutputLanguage } from "@/lib/openrouter";
import { filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { getFriendlyErrorMessage, isOnline, OFFLINE_MESSAGE } from "@/lib/network";
import { dispatchDocEvent } from "@/lib/docEvents";
import {
  ONNX_SESSION_CACHE,
  clearTtsSessionCache,
  predictWithRecovery,
  hasCompletedTtsVoiceSetup,
  markTtsVoiceSetupComplete,
} from "@/lib/ttsEngine";

export type TtsSource = "original" | "ai";

const TTS_VOICE_URI_LS = "doclens:tts-voice-uri";

// Re-exported so existing `from "@/context/TtsContext"` imports keep working unchanged.
export { clearTtsSessionCache, hasCompletedTtsVoiceSetup, markTtsVoiceSetupComplete };

/** Stops and detaches the current <audio> element (if any) without revoking its object URL. */
function stopCurrentAudioElement(audioRef: React.RefObject<HTMLAudioElement | null>) {
  if (audioRef.current) {
    try {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
    } catch (e) {}
    audioRef.current.src = "";
    audioRef.current = null;
  }
}

export interface TtsVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  isNeural?: boolean;
  isDownloaded?: boolean;
}

export function isNeuralVoiceUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  if (uri.startsWith("✨ Neural")) return true;
  // Piper voice IDs always follow the pattern: [lang]_[COUNTRY]-[name]-[quality] e.g. hi_IN-amit-medium, en_US-lessac-medium
  if (/^[a-z]{2,3}(_[a-zA-Z0-9]+)?-[a-zA-Z0-9_]+-[a-zA-Z0-9_]+/i.test(uri)) return true;
  return false;
}

interface TtsContextType {
  isPlaying: boolean;
  isPaused: boolean;
  sentences: string[];
  currentSentenceIndex: number;
  currentTextSource: TtsSource | null;
  activePageNumber: number | null;
  rate: number;
  selectedVoiceUri: string | null;
  availableVoices: TtsVoice[];
  filteredVoices: TtsVoice[];
  allNeuralVoices: TtsVoice[];
  continuousPlay: boolean;
  isNeuralLoading: boolean;
  outputLanguage: string;
  play: (text: string, source: TtsSource, pageNumber: number, startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  nextSentence: () => void;
  prevSentence: () => void;
  seekSentence: (index: number) => void;
  setRate: (rate: number) => void;
  setSelectedVoiceUri: (uri: string | null) => void;
  setContinuousPlay: (val: boolean) => void;
  setOutputLanguage: (lang: string) => void;
  downloadVoice: (voiceUri: string, onProgress?: (progress: number) => void) => Promise<void>;
  deleteVoice: (voiceUri: string) => Promise<void>;
  refreshVoices: (includeNeural?: boolean) => Promise<TtsVoice[]>;
}

const TtsContext = createContext<TtsContextType | null>(null);

interface PreSynthesizedEntry {
  url: string | null;
  promise: Promise<Blob> | null;
}

let neuralEnginePromise: Promise<{ mod: any; catalog: any[] }> | null = null;

/** Lazy singleton for the heavy neural TTS engine & ONNX runtime. */
async function getNeuralTtsEngine(): Promise<{ mod: any; catalog: any[] }> {
  if (typeof window === "undefined") {
    throw new Error("Neural TTS can only run in the browser.");
  }

  if (neuralEnginePromise) {
    return neuralEnginePromise;
  }

  neuralEnginePromise = (async () => {
    // 1. Initialize OPFS/IndexedDB voice cache first
    try {
      await initVoiceCache();
    } catch (err) {
      console.warn("Failed to initialize voice cache:", err);
    }

    // 2. Dynamically import @diffusionstudio/vits-web
    const mod = await import("@diffusionstudio/vits-web");

    // 3. Fetch voices metadata
    let catalog: any[] = [];
    try {
      const resp = await fetch("/voices.json");
      if (resp.ok) {
        catalog = await resp.json();
      }
    } catch (err) {
      console.warn("Could not load /voices.json, falling back to vits-web default:", err);
    }

    if (!catalog.length) {
      try {
        catalog = await mod.voices();
      } catch (err) {
        console.error("Failed to load VITS fallback voices:", err);
      }
    }

    // Register all voice paths into PATH_MAP
    for (const v of catalog) {
      const fileKeys = Object.keys(v.files || {});
      const onnxKey = fileKeys.find((k: string) => k.endsWith(".onnx") && !k.endsWith(".onnx.json"));
      if (onnxKey) {
        (mod.PATH_MAP as any)[v.key] = onnxKey;
        registerVoicePath(v.key, onnxKey);
      }
    }

    // 4. Import onnxruntime-web to configure memory & session pooling
    try {
      const ort: any = await import("onnxruntime-web");
      if (ort.env && ort.env.wasm) {
        ort.env.wasm.proxy = true;
        ort.env.wasm.numThreads = 1;
      }

      if (!ort.InferenceSession.originalCreate) {
        ort.InferenceSession.originalCreate = ort.InferenceSession.create;

        ort.InferenceSession.create = async function (model: any, options?: any) {
          const cacheKey = model instanceof ArrayBuffer
            ? `${model.byteLength}-${new Uint8Array(model.slice(0, 100)).join(",")}`
            : String(model);

          if (ONNX_SESSION_CACHE.has(cacheKey)) {
            return ONNX_SESSION_CACHE.get(cacheKey);
          }

          ort.env.wasm.proxy = true;
          ort.env.wasm.numThreads = 1;

          const session = await ort.InferenceSession.originalCreate(model, options);
          ONNX_SESSION_CACHE.set(cacheKey, session);
          return session;
        };
      }
    } catch (err) {
      console.error("Failed to configure onnxruntime-web:", err);
    }

    return { mod, catalog };
  })();

  return neuralEnginePromise;
}

export function TtsProvider({ children }: { children: React.ReactNode }) {
  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlayingState] = useState(false);
  const setIsPlaying = useCallback((val: boolean) => {
    setIsPlayingState(val);
    isPlayingRef.current = val;
  }, []);

  const isPausedRef = useRef(false);
  const [isPaused, setIsPausedState] = useState(false);
  const setIsPaused = useCallback((val: boolean) => {
    setIsPausedState(val);
    isPausedRef.current = val;
  }, []);

  const sentencesRef = useRef<string[]>([]);
  const [sentences, setSentencesState] = useState<string[]>([]);
  const setSentences = useCallback((val: string[]) => {
    setSentencesState(val);
    sentencesRef.current = val;
  }, []);

  const currentSentenceIndexRef = useRef(0);
  const [currentSentenceIndex, setCurrentSentenceIndexState] = useState(0);
  const setCurrentSentenceIndex = useCallback((val: number) => {
    setCurrentSentenceIndexState(val);
    currentSentenceIndexRef.current = val;
  }, []);

  const activePageNumberRef = useRef<number | null>(null);
  const [activePageNumber, setActivePageNumberState] = useState<number | null>(null);
  const setActivePageNumber = useCallback((val: number | null) => {
    setActivePageNumberState(val);
    activePageNumberRef.current = val;
  }, []);

  const currentTextSourceRef = useRef<TtsSource | null>(null);
  const [currentTextSource, setCurrentTextSourceState] = useState<TtsSource | null>(null);
  const setCurrentTextSource = useCallback((val: TtsSource | null) => {
    setCurrentTextSourceState(val);
    currentTextSourceRef.current = val;
  }, []);
  
  // Persist rate, voice, and continuous play to localStorage
  const [rate, setRateState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doclens:tts-rate");
      return stored ? parseFloat(stored) : 1.0;
    }
    return 1.0;
  });
  
  const [selectedVoiceUri, setSelectedVoiceUriState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(TTS_VOICE_URI_LS);
    }
    return null;
  });

  const selectedVoiceUriRef = useRef<string | null>(selectedVoiceUri);
  useEffect(() => {
    selectedVoiceUriRef.current = selectedVoiceUri;
  }, [selectedVoiceUri]);
  
  const [continuousPlay, setContinuousPlayState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doclens:tts-continuous");
      return stored !== null ? stored === "true" : true;
    }
    return true;
  });

  const [outputLanguage, setOutputLanguageState] = useState<string>(() => {
    return getOutputLanguage();
  });

  const outputLanguageRef = useRef<string>(outputLanguage);
  useEffect(() => {
    outputLanguageRef.current = outputLanguage;
  }, [outputLanguage]);

  const [availableVoices, setAvailableVoices] = useState<TtsVoice[]>([]);
  const availableVoicesRef = useRef<TtsVoice[]>([]);
  useEffect(() => {
    availableVoicesRef.current = availableVoices;
  }, [availableVoices]);

  const [neuralVoices, setNeuralVoices] = useState<TtsVoice[]>([]);
  const [isNeuralLoading, setIsNeuralLoading] = useState<boolean>(false);

  // References for playback and synthesis
  const rateRef = useRef(rate);
  const ttsRef = useRef<any | null>(null);
  const rawCatalogRef = useRef<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isTransitioningRef = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const synthesisSessionIdRef = useRef<number>(0);
  const loadingIndexRef = useRef<number | null>(null);
  const preSynthesizedMapRef = useRef<Map<number, PreSynthesizedEntry>>(new Map());

  // Internal voice list updater
  const refreshVoicesInternal = useCallback(async (catalog: any[] = []): Promise<TtsVoice[]> => {
    const browserList = await getBrowserVoices();
    const native: TtsVoice[] = browserList.map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
      isNeural: false,
      isDownloaded: true,
    }));

    // Build neural voice list from the raw catalog + cached IDs
    let neural: TtsVoice[] = [];
    if (catalog.length > 0) {
      const cachedIds = await getCachedVoiceIds();
      neural = catalog.map((v: any) => {
        const langTag = v.language.code.replace("_", "-");
        const englishName = v.language.name_english;
        return {
          voiceURI: v.key,
          name: `✨ Neural ${v.name} (${englishName})`,
          lang: langTag,
          localService: true,
          default: false,
          isNeural: true,
          isDownloaded: cachedIds.includes(v.key),
        };
      });
    }

    const combined = [...native, ...neural];
    setAvailableVoices(combined);
    availableVoicesRef.current = combined;
    setNeuralVoices(neural);
    return combined;
  }, []);

  // Public voice refresher: on demand, optionally initializes the neural catalog
  const refreshVoices = useCallback(async (includeNeural: boolean = false): Promise<TtsVoice[]> => {
    let catalog = rawCatalogRef.current;
    if (includeNeural && (!ttsRef.current || catalog.length === 0)) {
      try {
        const { mod, catalog: loadedCatalog } = await getNeuralTtsEngine();
        ttsRef.current = mod;
        rawCatalogRef.current = loadedCatalog;
        catalog = loadedCatalog;
      } catch (err) {
        console.error("[TTS] Failed to load neural engine during voice refresh:", err);
      }
    }
    return await refreshVoicesInternal(catalog);
  }, [refreshVoicesInternal]);

  // Ensure neural engine is loaded on-demand
  const ensureNeuralEngine = useCallback(async () => {
    if (ttsRef.current && rawCatalogRef.current.length > 0) {
      return ttsRef.current;
    }
    try {
      const { mod, catalog } = await getNeuralTtsEngine();
      ttsRef.current = mod;
      rawCatalogRef.current = catalog;
      await refreshVoicesInternal(catalog);
      return mod;
    } catch (err) {
      console.error("[TTS] Failed to initialize neural engine:", err);
      return null;
    }
  }, [refreshVoicesInternal]);

  // Initial load: ONLY fetch native browser voices on startup (minimal memory footprint!)
  useEffect(() => {
    if (typeof window === "undefined") return;
    void refreshVoices(false);
  }, [refreshVoices]);

  // Sync outputLanguage when window regains focus or storage changes
  useEffect(() => {
    const syncLanguage = () => {
      const lang = getOutputLanguage();
      setOutputLanguageState(lang);
      outputLanguageRef.current = lang;
    };
    window.addEventListener("focus", syncLanguage);
    window.addEventListener("storage", syncLanguage);
    return () => {
      window.removeEventListener("focus", syncLanguage);
      window.removeEventListener("storage", syncLanguage);
    };
  }, []);

  const setOutputLanguage = useCallback((lang: string) => {
    setOutputLanguageState(lang);
    outputLanguageRef.current = lang;
  }, []);

  // Filtered voices by selected language
  const filteredVoices = useMemo(() => {
    return filterVoicesByLanguage(availableVoices, outputLanguage);
  }, [availableVoices, outputLanguage]);

  // Setters with localStorage persistence
  const setRate = (newRate: number) => {
    rateRef.current = newRate;
    setRateState(newRate);
    localStorage.setItem("doclens:tts-rate", newRate.toString());
  };

  const setSelectedVoiceUri = useCallback((uri: string | null) => {
    selectedVoiceUriRef.current = uri;
    setSelectedVoiceUriState(uri);
    if (uri) {
      localStorage.setItem(TTS_VOICE_URI_LS, uri);
    } else {
      localStorage.removeItem(TTS_VOICE_URI_LS);
    }
  }, []);

  const setContinuousPlay = (val: boolean) => {
    setContinuousPlayState(val);
    localStorage.setItem("doclens:tts-continuous", val.toString());
  };

  // Auto-switch voice when language filter excludes current selection
  useEffect(() => {
    if (!selectedVoiceUri || filteredVoices.length === 0) return;
    const currentVoiceInFiltered = filteredVoices.some((v) => v.voiceURI === selectedVoiceUri);
    if (!currentVoiceInFiltered) {
      const firstNeural = filteredVoices.find((v) => v.isNeural && v.isDownloaded);
      const fallback = firstNeural || filteredVoices.find(v => v.isNeural) || filteredVoices[0];
      if (fallback) {
        setSelectedVoiceUri(fallback.voiceURI);
      }
    }
  }, [filteredVoices, selectedVoiceUri, setSelectedVoiceUri]);

  const cleanupAudio = useCallback(() => {
    // Increment session ID token to invalidate any in-flight promises/events from previous pages
    synthesisSessionIdRef.current++;

    stopCurrentAudioElement(audioRef);
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch (e) {}
      activeAudioUrlRef.current = null;
    }
    // Clean up all pre-synthesized audio object URLs
    preSynthesizedMapRef.current.forEach((entry) => {
      if (entry.url) {
        try {
          URL.revokeObjectURL(entry.url);
        } catch (e) {}
      }
    });
    preSynthesizedMapRef.current.clear();

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    loadingIndexRef.current = null;
  }, []);

  // Multi-sentence look-ahead queue processor for zero-latency gapless playback
  const processPreSynthesizeQueue = useCallback(
    (currentIndex: number, sentenceList: string[]) => {
      if (!isPlayingRef.current) return;
      const currentSessionId = synthesisSessionIdRef.current;
      const targetVoiceUri = selectedVoiceUriRef.current || localStorage.getItem(TTS_VOICE_URI_LS);
      let voice = availableVoicesRef.current.find((v) => v.voiceURI === targetVoiceUri);
      if (!voice) {
        const matching = filterVoicesByLanguage(availableVoicesRef.current, outputLanguageRef.current);
        voice = matching.find((v) => v.isNeural && v.isDownloaded) || matching.find((v) => v.isNeural) || matching[0];
      }
      const isNeural = Boolean(voice?.isNeural || isNeuralVoiceUri(voice?.voiceURI || targetVoiceUri));
      if (!isNeural || !ttsRef.current) return;

      const activeVoiceId = voice?.voiceURI || targetVoiceUri;
      const LOOKAHEAD_COUNT = 3; // Pre-synthesize up to 3 sentences ahead

      // Evict entries behind current sentence index to free memory
      preSynthesizedMapRef.current.forEach((entry, idx) => {
        if (idx < currentIndex) {
          if (entry.url) {
            try {
              URL.revokeObjectURL(entry.url);
            } catch (e) {}
          }
          preSynthesizedMapRef.current.delete(idx);
        }
      });

      // Find the next index in range that hasn't started synthesis yet
      let nextIdxToSynthesize: number | null = null;
      for (let i = currentIndex + 1; i <= currentIndex + LOOKAHEAD_COUNT; i++) {
        if (i < sentenceList.length) {
          const text = sentenceList[i]?.trim();
          if (text && !preSynthesizedMapRef.current.has(i)) {
            nextIdxToSynthesize = i;
            break;
          }
        }
      }

      if (nextIdxToSynthesize === null) return;

      const targetIndex = nextIdxToSynthesize;
      const textToSynthesize = sentenceList[targetIndex].trim();

      const promise: Promise<Blob> = predictWithRecovery(ttsRef.current, {
        text: textToSynthesize,
        voiceId: activeVoiceId,
      });

      const entry: PreSynthesizedEntry = {
        url: null,
        promise: promise,
      };
      preSynthesizedMapRef.current.set(targetIndex, entry);

      promise
        .then((wavBlob: Blob) => {
          if (synthesisSessionIdRef.current !== currentSessionId) return;

          const currentEntry = preSynthesizedMapRef.current.get(targetIndex);
          if (currentEntry) {
            currentEntry.url = URL.createObjectURL(wavBlob);
          }
          // Continue filling queue for subsequent look-ahead slots
          if (isPlayingRef.current) {
            processPreSynthesizeQueue(currentSentenceIndexRef.current, sentencesRef.current);
          }
        })
        .catch((err: any) => {
          if (synthesisSessionIdRef.current !== currentSessionId) return;

          console.warn(`[TTS] Failed to pre-synthesize chunk ${targetIndex}:`, err);
          preSynthesizedMapRef.current.delete(targetIndex);
          if (isPlayingRef.current) {
            processPreSynthesizeQueue(currentSentenceIndexRef.current, sentencesRef.current);
          }
        });
    },
    [],
  );

  // Speaks the sentence at the specified index
  const speakSentence = useCallback(
    (index: number, sentenceList: string[]) => {
      isTransitioningRef.current = false;
      const currentSessionId = synthesisSessionIdRef.current;

      // Clear any previous active audio element before starting a new one.
      stopCurrentAudioElement(audioRef);
      if (activeAudioUrlRef.current) {
        try {
          URL.revokeObjectURL(activeAudioUrlRef.current);
        } catch (e) {}
        activeAudioUrlRef.current = null;
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      loadingIndexRef.current = null;

      if (index < 0 || index >= sentenceList.length) {
        if (continuousPlay && activePageNumberRef.current !== null) {
          dispatchDocEvent("doclens:tts-next-page", {
            currentPage: activePageNumberRef.current,
            source: currentTextSourceRef.current,
          });
        } else {
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentSentenceIndex(0);
        }
        return;
      }

      setIsPaused(false);
      setCurrentSentenceIndex(index);
      const rawSentence = sentenceList[index];
      const sentenceText = rawSentence.trim();

      if (!sentenceText) {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        speakSentence(index + 1, sentenceList);
        return;
      }

      // Determine active voice to use
      const targetVoiceUri = selectedVoiceUriRef.current || localStorage.getItem(TTS_VOICE_URI_LS);
      let voice = availableVoicesRef.current.find((v) => v.voiceURI === targetVoiceUri);

      if (!voice) {
        const langVoices = filterVoicesByLanguage(availableVoicesRef.current, outputLanguageRef.current);
        voice = langVoices.find((v) => v.isNeural && v.isDownloaded) ||
                langVoices.find((v) => v.isNeural) ||
                langVoices[0] ||
                availableVoicesRef.current[0];
        if (voice && !targetVoiceUri) {
          setSelectedVoiceUri(voice.voiceURI);
        }
      }

      const isNeural = Boolean(voice?.isNeural || isNeuralVoiceUri(voice?.voiceURI || targetVoiceUri));

      const attachAudioHandlers = (audio: HTMLAudioElement, audioUrl: string) => {
        // Apply the latest speed dynamically for the upcoming segment
        audio.playbackRate = rateRef.current;

        audio.onended = () => {
          if (isTransitioningRef.current) return;
          if (synthesisSessionIdRef.current !== currentSessionId) return;
          isTransitioningRef.current = true;

          if (activeAudioUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl);
            activeAudioUrlRef.current = null;
          }

          const currentSentences = sentencesRef.current;
          const nextIdx = index + 1;
          if (nextIdx < currentSentences.length) {
            setCurrentSentenceIndex(nextIdx);
          }

          if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
          // Immediate 0ms transition between consecutive sentences for gapless playback!
          transitionTimeoutRef.current = setTimeout(() => {
            transitionTimeoutRef.current = null;
            if (isPausedRef.current) return;
            if (synthesisSessionIdRef.current !== currentSessionId) return;
            speakSentence(nextIdx, sentencesRef.current);
          }, 0);
        };

        audio.onerror = (err) => {
          console.error("Neural playback error:", err);
          if (activeAudioUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl);
            activeAudioUrlRef.current = null;
          }
          setIsPlaying(false);
        };

        // Populate the multi-sentence look-ahead queue in the background while this sentence plays!
        processPreSynthesizeQueue(index, sentenceList);
      };

      const playNeuralAudio = (audioUrl: string) => {
        stopCurrentAudioElement(audioRef);

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        attachAudioHandlers(audio, audioUrl);

        if (!isPausedRef.current && isPlayingRef.current) {
          const p = audio.play();
          if (p !== undefined) {
            p.catch((e) => {
              console.error("Audio play failed:", e);
            });
          }
        }
      };

      const initPausedAudio = (audioUrl: string) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        attachAudioHandlers(audio, audioUrl);
      };

      if (isNeural) {
        if (!ttsRef.current) {
          console.error("VITS TTS Engine not loaded yet.");
          setIsPlaying(false);
          return;
        }

        const activeVoiceId = voice?.voiceURI || targetVoiceUri;
        const entry = preSynthesizedMapRef.current.get(index);

        if (entry?.url) {
          // Already fully pre-synthesized in queue — play immediately with zero latency!
          const audioUrl = entry.url;
          preSynthesizedMapRef.current.delete(index);
          activeAudioUrlRef.current = audioUrl;

          playNeuralAudio(audioUrl);
        } else if (entry?.promise) {
          // Pre-synthesis for this index is currently in flight — await completion
          const promise = entry.promise;
          preSynthesizedMapRef.current.delete(index);

          loadingIndexRef.current = index;
          setIsNeuralLoading(true);

          promise
            .then((wavBlob: Blob) => {
              if (synthesisSessionIdRef.current !== currentSessionId || loadingIndexRef.current !== index || !isPlayingRef.current) {
                setIsNeuralLoading(false);
                return;
              }
              setIsNeuralLoading(false);

              const audioUrl = URL.createObjectURL(wavBlob);
              activeAudioUrlRef.current = audioUrl;

              if (isPausedRef.current) {
                initPausedAudio(audioUrl);
              } else {
                playNeuralAudio(audioUrl);
              }
            })
            .catch((err: any) => {
              if (synthesisSessionIdRef.current !== currentSessionId || loadingIndexRef.current !== index) return;
              setIsNeuralLoading(false);
              console.error("Neural synthesis error:", err);
              toast.error(getFriendlyErrorMessage(err, "Failed to generate neural speech"));
              setIsPlaying(false);
            });
        } else {
          // Not pre-synthesized — compile on demand
          if (voice && !voice.isDownloaded && !isOnline()) {
            setIsPlaying(false);
            toast.error(OFFLINE_MESSAGE);
            return;
          }

          loadingIndexRef.current = index;
          setIsNeuralLoading(true);

          let toastId: string | number | undefined;

          predictWithRecovery(
            ttsRef.current,
            {
              text: sentenceText,
              voiceId: activeVoiceId,
            },
            (progress: any) => {
              if (loadingIndexRef.current !== index) return;
              if (voice && !voice.isDownloaded && progress?.loaded && progress?.total) {
                const pct = Math.round((progress.loaded * 100) / progress.total);
                if (!toastId) {
                  toastId = toast.loading(`Downloading Voice Model: ${pct}%`);
                } else {
                  toast.loading(`Downloading Voice Model: ${pct}%`, { id: toastId });
                }
              }
            },
          )
            .then((wavBlob: Blob) => {
              if (toastId) toast.dismiss(toastId);

              if (voice && !voice.isDownloaded) {
                void refreshVoices(true);
              }

              if (synthesisSessionIdRef.current !== currentSessionId || loadingIndexRef.current !== index || !isPlayingRef.current) {
                setIsNeuralLoading(false);
                return;
              }
              setIsNeuralLoading(false);

              const audioUrl = URL.createObjectURL(wavBlob);
              activeAudioUrlRef.current = audioUrl;

              if (isPausedRef.current) {
                initPausedAudio(audioUrl);
              } else {
                playNeuralAudio(audioUrl);
              }
            })
            .catch((err: any) => {
              if (toastId) toast.dismiss(toastId);
              if (synthesisSessionIdRef.current !== currentSessionId || loadingIndexRef.current !== index) return;
              setIsNeuralLoading(false);
              console.error("Neural synthesis error:", err);
              toast.error(getFriendlyErrorMessage(err, "Failed to generate neural speech"));
              setIsPlaying(false);
            });
        }
      } else {
        // Standard Native / Browser Web Speech API
        if (typeof window === "undefined" || !window.speechSynthesis) return;

        try {
          window.speechSynthesis.cancel();
        } catch {}

        const utterance = new SpeechSynthesisUtterance(sentenceText);
        utteranceRef.current = utterance;

        if (voice) {
          const nativeVoices = window.speechSynthesis.getVoices();
          const nativeVoice = nativeVoices.find((v) => v.voiceURI === voice.voiceURI) ||
            nativeVoices.find((v) => v.lang.startsWith(voice.lang.slice(0, 2)));
          if (nativeVoice) {
            utterance.voice = nativeVoice;
            utterance.lang = nativeVoice.lang;
          }
        }
        utterance.rate = rateRef.current;

        utterance.onend = () => {
          if (isTransitioningRef.current) return;
          if (synthesisSessionIdRef.current !== currentSessionId) return;
          isTransitioningRef.current = true;
          speakSentence(index + 1, sentencesRef.current);
        };

        utterance.onerror = (e) => {
          if (e.error === "interrupted" || e.error === "canceled") return;
          console.error("TTS SpeechSynthesisUtterance error:", e);
          setIsPlaying(false);
          setIsPaused(false);
        };

        window.speechSynthesis.speak(utterance);
      }
    },
    [continuousPlay, processPreSynthesizeQueue, refreshVoices, setSelectedVoiceUri, setIsPlaying, setIsPaused, setCurrentSentenceIndex],
  );

  // Public play control
  const play = useCallback(
    (text: string, source: TtsSource, pageNumber: number, startIndex: number = 0) => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      cleanupAudio();

      const list = splitSentences(text);
      if (list.length === 0) return;
      
      setSentences(list);
      setCurrentTextSource(source);
      setActivePageNumber(pageNumber);
      setIsPlaying(true);
      setIsPaused(false);
      
      const targetVoiceUri = selectedVoiceUriRef.current || localStorage.getItem(TTS_VOICE_URI_LS);
      const isTargetNeural = isNeuralVoiceUri(targetVoiceUri);

      // If neural engine is needed or not loaded yet, ensure it is initialized then play
      if (isTargetNeural && !ttsRef.current) {
        setIsNeuralLoading(true);
        void ensureNeuralEngine().then(() => {
          setIsNeuralLoading(false);
          speakSentence(startIndex, list);
        });
      } else {
        speakSentence(startIndex, list);
      }
    },
    [speakSentence, cleanupAudio, ensureNeuralEngine, setIsPlaying, setIsPaused, setSentences, setCurrentTextSource, setActivePageNumber],
  );

  const pause = useCallback(() => {
    setIsPaused(true);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    // Note: intentionally NOT releasing the ONNX session cache here (unlike
    // stop()/unmount/voice-change) — pause is expected to be followed by a
    // resume, and releasing the session forces a full WASM model reload
    // (multi-second stall) the next time a sentence needs synthesizing.
  }, [setIsPaused]);

  const resume = useCallback(() => {
    setIsPaused(false);
    if (audioRef.current && !audioRef.current.ended) {
      audioRef.current.play().catch(e => console.error("Resume failed:", e));
    } else {
      speakSentence(currentSentenceIndexRef.current, sentencesRef.current);
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }, [speakSentence, setIsPaused]);

  const stop = useCallback(() => {
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // Release ONNX sessions to immediately reclaim WASM memory when playback is stopped
    void clearTtsSessionCache();
    setIsPlaying(false);
    setIsPaused(false);
    setSentences([]);
    setCurrentSentenceIndex(0);
    setCurrentTextSource(null);
    setActivePageNumber(null);
  }, [cleanupAudio, setIsPlaying, setIsPaused, setSentences, setCurrentSentenceIndex, setCurrentTextSource, setActivePageNumber]);

  const nextSentence = useCallback(() => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(currentSentenceIndexRef.current + 1, sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  const prevSentence = useCallback(() => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(Math.max(0, currentSentenceIndexRef.current - 1), sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  const seekSentence = useCallback((index: number) => {
    if (!isPlayingRef.current) return;
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakSentence(index, sentencesRef.current);
  }, [speakSentence, cleanupAudio]);

  const downloadVoice = useCallback(async (voiceUri: string, onProgress?: (p: number) => void) => {
    await ensureNeuralEngine();
    await downloadVoiceFromCache(voiceUri, onProgress);
    await refreshVoices(true);
  }, [ensureNeuralEngine, refreshVoices]);

  const deleteVoice = useCallback(async (voiceUri: string) => {
    await deleteCachedVoice(voiceUri);
    await refreshVoices(true);
  }, [refreshVoices]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      // Release ONNX sessions to reclaim memory when the component is unmounted
      void clearTtsSessionCache();
    };
  }, [cleanupAudio]);

  // Track the last actual voice URI to detect voice changes
  const lastVoiceUriRef = useRef<string | null>(selectedVoiceUri);

  // Automatically switch voice if changed during active playback
  useEffect(() => {
    if (selectedVoiceUri !== lastVoiceUriRef.current) {
      const oldVoice = lastVoiceUriRef.current;
      lastVoiceUriRef.current = selectedVoiceUri;

      // Release cached ONNX sessions when selected voice changes to prevent holding multiple voices in memory
      void clearTtsSessionCache();

      if (isPlayingRef.current && oldVoice && selectedVoiceUri) {
        // Pause/Cancel the current playing engine
        stopCurrentAudioElement(audioRef);
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        
        // Revoke any active URL
        if (activeAudioUrlRef.current) {
          try {
            URL.revokeObjectURL(activeAudioUrlRef.current);
          } catch (e) {}
          activeAudioUrlRef.current = null;
        }
        
        // Revoke pre-synthesized queue because it was for the old voice!
        preSynthesizedMapRef.current.forEach((entry) => {
          if (entry.url) {
            try {
              URL.revokeObjectURL(entry.url);
            } catch (e) {}
          }
        });
        preSynthesizedMapRef.current.clear();

        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
          transitionTimeoutRef.current = null;
        }

        // Resume playback at the current sentence with the new voice
        speakSentence(currentSentenceIndexRef.current, sentencesRef.current);
      }
    }
  }, [selectedVoiceUri, speakSentence]);

  return (
    <TtsContext.Provider
      value={{
        isPlaying,
        isPaused,
        sentences,
        currentSentenceIndex,
        currentTextSource,
        activePageNumber,
        rate,
        selectedVoiceUri,
        availableVoices,
        filteredVoices,
        allNeuralVoices: neuralVoices,
        continuousPlay,
        isNeuralLoading,
        outputLanguage,
        play,
        pause,
        resume,
        stop,
        nextSentence,
        prevSentence,
        seekSentence,
        setRate,
        setSelectedVoiceUri,
        setContinuousPlay,
        setOutputLanguage,
        downloadVoice,
        deleteVoice,
        refreshVoices,
      }}
    >
      {children}
    </TtsContext.Provider>
  );
}

export function useTts() {
  const context = useContext(TtsContext);
  if (!context) {
    throw new Error("useTts must be used within a TtsProvider");
  }
  return context;
}
