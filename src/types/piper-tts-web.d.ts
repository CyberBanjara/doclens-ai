/**
 * Type declarations for piper-tts-web (Poket-Jony).
 * The package ships no .d.ts files, so we declare the surface we use.
 */
declare module "piper-tts-web" {
  interface PiperEngineOptions {
    onnxRuntime?: any;
    phonemizeRuntime?: any;
    expressionRuntime?: any;
    voiceProvider?: {
      fetch(voiceId: string): Promise<[any, string]>;
      list?(): Promise<any>;
      destroy?(): void;
    };
  }

  interface PiperGenerateResult {
    phonemeData: any;
    /** WAV audio as a Blob */
    file: Blob;
    /** Duration in milliseconds */
    duration: number;
  }

  export class PiperWebEngine {
    constructor(options?: PiperEngineOptions);
    generate(text: string, voiceId: string, speakerId?: number): Promise<PiperGenerateResult>;
    destroy(): void;
  }

  export class PiperWebWorkerEngine extends PiperWebEngine {
    constructor(options?: PiperEngineOptions);
  }

  export class HuggingFaceVoiceProvider {
    constructor(options?: { provider?: any; baseUrl?: string; separator?: string });
    fetch(voiceId: string): Promise<[any, string]>;
    list(): Promise<any>;
    destroy(): void;
  }
}
