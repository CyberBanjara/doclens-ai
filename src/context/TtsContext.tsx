import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { splitSentences, getBrowserVoices } from "@/lib/tts";
import { toast } from "sonner";
import { initVoiceCache, registerVoicePath, getCachedVoiceIds, downloadVoice as downloadVoiceFromCache, deleteCachedVoice } from "@/lib/voiceCache";
import { getOutputLanguage } from "@/lib/openrouter";
import { filterVoicesByLanguage, getLanguageEnglishName, LANGUAGES, type LanguageInfo } from "@/lib/voiceLanguageMap";
import { getFriendlyErrorMessage, isOnline, OFFLINE_MESSAGE } from "@/lib/network";

export type TtsSource = "original" | "ai";

const TTS_VOICE_URI_LS = "doclens:tts-voice-uri";
const TTS_ONBOARDED_LS = "doclens:tts-onboarded";

// Global cache to hold reference to active ONNX InferenceSession instances
const ONNX_SESSION_CACHE = new Map<string, any>();

/**
 * Iterates over all cached ONNX sessions, releases them to reclaim WASM heap memory,
 * and clears the cache.
 */
export async function clearTtsSessionCache() {
  for (const [key, session] of ONNX_SESSION_CACHE.entries()) {
    try {
      if (session && typeof session.release === "function") {
        await session.release();
        console.log(`[TTS] Released ONNX InferenceSession for: ${key}`);
      }
    } catch (e) {
      console.warn("[TTS] Failed to release ONNX InferenceSession:", e);
    }
  }
  ONNX_SESSION_CACHE.clear();
}

/**
 * A previously-cached voice model (OPFS/IndexedDB) can end up mismatched with its
 * config — e.g. downloaded mid-update from the upstream Piper voices repo — which
 * surfaces as an ONNX Gather/index-out-of-bounds error at inference time. Since the
 * bad pair is cached indefinitely, the user would otherwise be stuck forever. Detect
 * that failure signature, wipe the cached copy of just that voice, and retry once
 * with a fresh download.
 */
async function predictWithRecovery(
  tts: any,
  params: { text: string; voiceId: string | null },
  onProgress?: (progress: any) => void
): Promise<Blob> {
  try {
    return await tts.predict(params, onProgress);
  } catch (err: any) {
    const message = String(err?.message || err || "");
    const looksLikeCorruptedModel = /Gather|out of data bounds|OrtRun|ERROR_CODE/i.test(message);
    if (!looksLikeCorruptedModel) throw err;

    console.warn(
      `[TTS] Voice model "${params.voiceId}" failed inference (likely a corrupted/stale cached copy) — clearing cache and retrying:`,
      message
    );
    await clearTtsSessionCache();
    if (params.voiceId) await deleteCachedVoice(params.voiceId);
    return await tts.predict(params, onProgress);
  }
}


/**
 * Explicit flag set once the user has picked a language/voice through the
 * onboarding dialog or settings. Kept separate from TTS_VOICE_URI_LS because
 * that key can also be written by an automatic fallback (see the "Auto-switch
 * voice when language filter excludes current selection" effect below), which
 * would otherwise make onboarding look "complete" without any user action.
 */
export function hasCompletedTtsVoiceSetup(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TTS_ONBOARDED_LS) === "true";
}

export function markTtsVoiceSetupComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TTS_ONBOARDED_LS, "true");
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
  setContinuousPlay: (continuous: boolean) => void;
  setOutputLanguage: (lang: string) => void;
  downloadVoice: (voiceUri: string, onProgress?: (p: number) => void) => Promise<void>;
  deleteVoice: (voiceUri: string) => Promise<void>;
  refreshVoices: () => Promise<TtsVoice[]>;
}

const TtsContext = createContext<TtsContextType | undefined>(undefined);

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

  // Ref-paired like isPlaying/isPaused/etc above: play() calls setActivePageNumber
  // and setCurrentTextSource and then synchronously invokes speakSentence in the
  // same tick, before React re-renders — a plain useState closure inside
  // speakSentence would therefore see the *previous* page's value for the whole
  // recursive onended chain, never the one just set. That made the "continuous
  // play && activePageNumber !== null" advance-to-next-page check at the bottom
  // of speakSentence always evaluate against a stale (frequently null, always
  // one page behind) value, so doclens:tts-next-page either never fired or fired
  // with the wrong page number.
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
  
  const [continuousPlay, setContinuousPlayState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("doclens:tts-continuous");
      return stored ? stored === "true" : true;
    }
    return true;
  });

  const [availableVoices, setAvailableVoices] = useState<TtsVoice[]>([]);
  const [isNeuralLoading, setIsNeuralLoading] = useState(false);
  const [neuralVoices, setNeuralVoices] = useState<TtsVoice[]>([]);
  const [outputLanguage, setOutputLanguageState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getOutputLanguage();
    }
    return "हिंदी";
  });
  // Raw Piper catalog entries for dynamic voice registration
  const rawCatalogRef = useRef<any[]>([]);
  
  // Utterance and Audio refs to prevent garbage collection during playback
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const nextAudioUrlRef = useRef<string | null>(null);
  const nextAudioIndexRef = useRef<number | null>(null);
  // The in-flight predict() promise backing nextAudioIndexRef, while it hasn't
  // resolved to nextAudioUrlRef yet. Lets speakSentence await the same
  // synthesis instead of starting a duplicate one for the same sentence.
  const nextAudioPromiseRef = useRef<Promise<Blob> | null>(null);
  const loadingIndexRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<any>(null);
  const ttsRef = useRef<any>(null);
  // Track continuous sentence state to avoid race conditions
  const isTransitioningRef = useRef(false);

  // Refresh voice list: merge native browser voices with neural catalog voices
  const refreshVoices = useCallback(async () => {
    const nativeSpeechVoices = await getBrowserVoices();
    const native: TtsVoice[] = nativeSpeechVoices.map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
      isNeural: false,
    }));

    // Build neural voice list from the raw catalog + cached IDs
    let neural: TtsVoice[] = [];
    if (rawCatalogRef.current.length > 0) {
      const cachedIds = await getCachedVoiceIds();
      neural = rawCatalogRef.current.map((v: any) => {
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
    setNeuralVoices(neural);
    return combined;
  }, []);

  // Load neural voices dynamically (Client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize voice caching interceptor early
    initVoiceCache();

    // Dynamic import to prevent SSR crashes
    import("@diffusionstudio/vits-web").then(async (mod) => {
      ttsRef.current = mod;

      // Load the full Piper voice catalog from voices.json
      let catalog: any[] = [];
      try {
        const res = await fetch("/voices.json");
        if (res.ok) {
          const json = await res.json();
          catalog = Object.values(json);
        }
      } catch (err) {
        console.error("Failed to load voices.json catalog:", err);
      }

      // Fallback to vits-web built-in voices if catalog failed to load
      if (catalog.length === 0) {
        try {
          catalog = await mod.voices();
        } catch (err) {
          console.error("Failed to load VITS fallback voices:", err);
        }
      }

      // Register all voice paths into PATH_MAP (for cache interceptor + vits-web)
      for (const v of catalog) {
        const fileKeys = Object.keys(v.files || {});
        const onnxKey = fileKeys.find((k: string) => k.endsWith(".onnx") && !k.endsWith(".onnx.json"));
        if (onnxKey) {
          (mod.PATH_MAP as any)[v.key] = onnxKey;
          registerVoicePath(v.key, onnxKey);
        }
      }

      rawCatalogRef.current = catalog;

      // Import onnxruntime-web to monkeypatch session creation
      import("onnxruntime-web").then((ort: any) => {
        if (ort.env && ort.env.wasm) {
          // Run WASM inference in a Worker instead of the main thread. Without this,
          // every predict() call synchronously blocks the UI for the full duration of
          // synthesis (measured 10s+ stalls on a real sentence) — this is the actual
          // cause of the "screen freezes/hangs" symptom during TTS playback.
          ort.env.wasm.proxy = true;
          // No COOP/COEP headers are set (removed in the storage-layer revert), so
          // crossOriginIsolated is false and SharedArrayBuffer is unavailable —
          // multi-threaded WASM cannot work here.
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

            // vits-web's predict() resets numThreads to navigator.hardwareConcurrency
            // and wasmPaths to a CDN URL before every single call (see its bundled
            // N() function) — undo that right before the real session is created so
            // it never requests multi-threaded WASM without SharedArrayBuffer support.
            ort.env.wasm.proxy = true;
            ort.env.wasm.numThreads = 1;

            const session = await ort.InferenceSession.originalCreate(model, options);
            ONNX_SESSION_CACHE.set(cacheKey, session);
            return session;
          };
        }
      }).catch((err: any) => {
        console.error("Failed to patch onnxruntime-web:", err);
      });

      // Refresh voice list now that catalog is loaded
      const voices = await refreshVoices();

      // Auto-select default voice if none set
      if (!selectedVoiceUri && voices.length > 0) {
        const defaultVoice = voices.find(v => v.lang.startsWith("en") || v.default) || voices[0];
        setSelectedVoiceUriState(defaultVoice.voiceURI);
      }
    }).catch((err) => {
      console.error("Failed to import @diffusionstudio/vits-web:", err);
    });
  }, [refreshVoices]);

  // Sync outputLanguage when window regains focus or storage changes
  useEffect(() => {
    const syncLanguage = () => {
      const lang = getOutputLanguage();
      setOutputLanguageState(lang);
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
  }, []);

  // Filtered voices by selected language
  const filteredVoices = useMemo(() => {
    return filterVoicesByLanguage(availableVoices, outputLanguage);
  }, [availableVoices, outputLanguage]);

  // Setters with localStorage persistence
  const setRate = (newRate: number) => {
    setRateState(newRate);
    localStorage.setItem("doclens:tts-rate", newRate.toString());
  };

  const setSelectedVoiceUri = (uri: string | null) => {
    setSelectedVoiceUriState(uri);
    if (uri) {
      localStorage.setItem(TTS_VOICE_URI_LS, uri);
    } else {
      localStorage.removeItem(TTS_VOICE_URI_LS);
    }
  };

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
  }, [filteredVoices, selectedVoiceUri]);
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch (e) {}
      activeAudioUrlRef.current = null;
    }
    if (nextAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(nextAudioUrlRef.current);
      } catch (e) {}
      nextAudioUrlRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    nextAudioIndexRef.current = null;
    nextAudioPromiseRef.current = null;
    loadingIndexRef.current = null;
  }, []);

  const preSynthesizeNext = useCallback((nextIndex: number, sentenceList: string[]) => {
    if (nextIndex < 0 || nextIndex >= sentenceList.length) return;

    // If already pre-synthesized/synthesizing this index, skip
    if (nextAudioIndexRef.current === nextIndex) return;

    const nextRawSentence = sentenceList[nextIndex];
    const nextSentenceText = nextRawSentence.trim();
    if (!nextSentenceText) return;

    const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);
    if (!voice?.isNeural || !ttsRef.current) return;

    // Set the index to indicate background compilation in progress
    nextAudioIndexRef.current = nextIndex;

    const promise: Promise<Blob> = predictWithRecovery(ttsRef.current, {
      text: nextSentenceText,
      voiceId: selectedVoiceUri
    });
    nextAudioPromiseRef.current = promise;

    promise.then((wavBlob: Blob) => {
      // Check if we are still on the path to play this (i.e. we haven't skipped past it,
      // and speakSentence hasn't already claimed this in-flight promise itself)
      if (nextAudioIndexRef.current === nextIndex) {
        if (nextAudioUrlRef.current) {
          URL.revokeObjectURL(nextAudioUrlRef.current);
        }
        nextAudioUrlRef.current = URL.createObjectURL(wavBlob);
      }
    }).catch((err: any) => {
      console.warn("Failed to pre-synthesize chunk:", err);
      if (nextAudioIndexRef.current === nextIndex) {
        nextAudioIndexRef.current = null;
        nextAudioPromiseRef.current = null;
      }
    });
  }, [availableVoices, selectedVoiceUri]);

  // Speaks the sentence at the specified index
  const speakSentence = useCallback((index: number, sentenceList: string[]) => {
    isTransitioningRef.current = false;
    
    // Clear any previous active audio element before starting a new one.
    // Do NOT call cleanupAudio() because we want to preserve nextAudioUrlRef (pre-synthesized)!
    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current.src = "";
      audioRef.current = null;
    }
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
      // Completed current text source. Read the *current* page/source off the
      // refs (not the closure-captured state above) — see the comment on
      // activePageNumberRef for why the plain state values are unreliable here.
      if (continuousPlay && activePageNumberRef.current !== null) {
        // Auto-advance to next page
        window.dispatchEvent(
          new CustomEvent("doclens:tts-next-page", {
            detail: { currentPage: activePageNumberRef.current, source: currentTextSourceRef.current }
          })
        );
      } else {
        // Complete playback
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

    const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);

    const playNeuralAudio = (audioUrl: string) => {
      // 1. Clean up any currently playing audio immediately to prevent double audio playback
      if (audioRef.current) {
        try {
          audioRef.current.onended = null;
          audioRef.current.onerror = null;
          audioRef.current.pause();
        } catch (e) {}
        audioRef.current.src = "";
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.playbackRate = rate;

      audio.onended = () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;

        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }

        const nextIdx = index + 1;
        if (nextIdx < sentenceList.length) {
          setCurrentSentenceIndex(nextIdx);
        }

        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = setTimeout(() => {
          transitionTimeoutRef.current = null;
          if (isPausedRef.current) return;
          speakSentence(nextIdx, sentenceList);
        }, 250);
      };

      audio.onerror = (err) => {
        console.error("Neural playback error:", err);
        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }
        setIsPlaying(false);
      };

      // Pre-synthesize the next chunk in the background immediately!
      preSynthesizeNext(index + 1, sentenceList);

      // Only play if not paused or stopped
      if (!isPausedRef.current && isPlayingRef.current) {
        audio.play().catch(e => {
          console.error("Audio play failed:", e);
        });
      }
    };

    // If the player was paused while this sentence's audio was being produced,
    // set up the <audio> element without starting playback.
    const initPausedAudio = (audioUrl: string) => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.playbackRate = rate;

      audio.onended = () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }
        const nextIdx = index + 1;
        if (nextIdx < sentenceList.length) {
          setCurrentSentenceIndex(nextIdx);
        }
        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = setTimeout(() => {
          transitionTimeoutRef.current = null;
          if (isPausedRef.current) return;
          speakSentence(nextIdx, sentenceList);
        }, 250);
      };

      audio.onerror = (err) => {
        console.error("Neural playback error:", err);
        if (activeAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          activeAudioUrlRef.current = null;
        }
        setIsPlaying(false);
      };

      preSynthesizeNext(index + 1, sentenceList);
    };

    if (voice?.isNeural) {
      if (!ttsRef.current) {
        console.error("VITS TTS Engine not loaded yet.");
        setIsPlaying(false);
        return;
      }

      if (nextAudioUrlRef.current && nextAudioIndexRef.current === index) {
        // Already fully pre-synthesized — use it immediately.
        const audioUrl = nextAudioUrlRef.current;
        activeAudioUrlRef.current = audioUrl;

        nextAudioUrlRef.current = null;
        nextAudioIndexRef.current = null;
        nextAudioPromiseRef.current = null;

        playNeuralAudio(audioUrl);
      } else if (nextAudioIndexRef.current === index && nextAudioPromiseRef.current) {
        // A pre-synthesis for this exact sentence is already in flight (started
        // ahead of time while the previous sentence was playing, but not done
        // yet). Wait for that same synthesis instead of starting a duplicate
        // one — starting a second predict() call here used to race with the
        // in-flight one, producing and playing the same line twice and
        // skipping the following line(s) once both resolved.
        const promise = nextAudioPromiseRef.current;

        // Claim the slot synchronously so preSynthesizeNext's own handler
        // (attached earlier on the same promise) becomes a no-op when it runs.
        nextAudioUrlRef.current = null;
        nextAudioIndexRef.current = null;
        nextAudioPromiseRef.current = null;

        loadingIndexRef.current = index;
        setIsNeuralLoading(true);

        promise.then((wavBlob: Blob) => {
          if (loadingIndexRef.current !== index || !isPlayingRef.current) {
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
        }).catch((err: any) => {
          if (loadingIndexRef.current !== index) return;
          setIsNeuralLoading(false);
          console.error("Neural synthesis error:", err);
          toast.error(getFriendlyErrorMessage(err, "Failed to generate neural speech"));
          setIsPlaying(false);
        });
      } else {
        // Nothing usable in flight for this exact index — invalidate any
        // stale/mismatched pre-synthesis slot (e.g. left over from a skip)
        // and compile fresh.
        if (nextAudioIndexRef.current !== null) {
          if (nextAudioUrlRef.current) {
            URL.revokeObjectURL(nextAudioUrlRef.current);
          }
          nextAudioUrlRef.current = null;
          nextAudioIndexRef.current = null;
          nextAudioPromiseRef.current = null;
        }

        // Fail fast with a clear message instead of waiting on a doomed fetch
        if (voice && !voice.isDownloaded && !isOnline()) {
          setIsPlaying(false);
          toast.error(OFFLINE_MESSAGE);
          return;
        }

        loadingIndexRef.current = index;
        setIsNeuralLoading(true);

        let toastId: string | number | undefined;

        predictWithRecovery(ttsRef.current, {
          text: sentenceText,
          voiceId: selectedVoiceUri
        }, (progress: any) => {
          if (loadingIndexRef.current !== index) return;
          // Only show download toast if the voice model is not already downloaded
          if (voice && !voice.isDownloaded) {
            const pct = Math.round(progress.loaded * 100 / progress.total);
            if (!toastId) {
              toastId = toast.loading(`Downloading Voice Model: ${pct}%`);
            } else {
              toast.loading(`Downloading Voice Model: ${pct}%`, { id: toastId });
            }
          }
        }).then((wavBlob: Blob) => {
          if (toastId) toast.dismiss(toastId);

          // Trigger refresh of voices list to mark the voice as downloaded
          if (voice && !voice.isDownloaded) {
            void refreshVoices();
          }

          // Discard if the player was stopped or loading index changed
          if (loadingIndexRef.current !== index || !isPlayingRef.current) {
            setIsNeuralLoading(false);
            return;
          }
          setIsNeuralLoading(false);

          const audioUrl = URL.createObjectURL(wavBlob);
          activeAudioUrlRef.current = audioUrl;

          // If player was paused, initialize audio element but do not play
          if (isPausedRef.current) {
            initPausedAudio(audioUrl);
          } else {
            playNeuralAudio(audioUrl);
          }
        }).catch((err: any) => {
          if (toastId) toast.dismiss(toastId);
          if (loadingIndexRef.current !== index) return;
          setIsNeuralLoading(false);
          console.error("Neural synthesis error:", err);
          toast.error(getFriendlyErrorMessage(err, "Failed to generate neural speech"));
          setIsPlaying(false);
        });
      }
    } else {
      // Standard Native / Browser Web Speech API
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utteranceRef.current = utterance; // Keep reference to prevent GC

      if (voice) {
        const nativeVoice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voice.voiceURI);
        if (nativeVoice) {
          utterance.voice = nativeVoice;
          utterance.lang = nativeVoice.lang;
        }
      }
      utterance.rate = rate;

      utterance.onend = () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        speakSentence(index + 1, sentenceList);
      };

      utterance.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("TTS SpeechSynthesisUtterance error:", e);
        setIsPlaying(false);
        setIsPaused(false);
      };

      window.speechSynthesis.speak(utterance);
    }
    // activePageNumber/currentTextSource are intentionally omitted — the
    // completion branch above reads them via activePageNumberRef/
    // currentTextSourceRef instead (see the comment where those refs are
    // declared), so this callback doesn't need to be recreated when they change.
  }, [availableVoices, selectedVoiceUri, rate, continuousPlay, preSynthesizeNext]);

  // Public controls
  const play = useCallback((text: string, source: TtsSource, pageNumber: number, startIndex: number = 0) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    cleanupAudio();

    const list = splitSentences(text);
    if (list.length === 0) return;
    
    setSentences(list);
    setCurrentTextSource(source);
    setActivePageNumber(pageNumber);
    setIsPlaying(true);
    setIsPaused(false);
    
    speakSentence(startIndex, list);
  }, [speakSentence, cleanupAudio]);

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
    // (multi-second stall) the next time a sentence needs synthesizing,
    // which reads as "unresponsive" play/pause/skip controls.
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
  }, [cleanupAudio, setIsPlaying, setIsPaused, setSentences, setCurrentSentenceIndex]);

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
    await downloadVoiceFromCache(voiceUri, onProgress);
    await refreshVoices();
  }, [refreshVoices]);

  const deleteVoice = useCallback(async (voiceUri: string) => {
    await deleteCachedVoice(voiceUri);
    await refreshVoices();
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
        if (audioRef.current) {
          try {
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.pause();
          } catch (e) {}
          audioRef.current.src = "";
          audioRef.current = null;
        }
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
        
        // Revoke pre-synthesized URL because it was for the old voice!
        if (nextAudioUrlRef.current) {
          try {
            URL.revokeObjectURL(nextAudioUrlRef.current);
          } catch (e) {}
          nextAudioUrlRef.current = null;
          nextAudioIndexRef.current = null;
        }

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
