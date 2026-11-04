import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  scanDirs: ["server"],
  replace: {
    __SERVER_OPENROUTER_DEFAULT_KEY__: JSON.stringify(
      process.env.OPENROUTER_API_KEY ||
        process.env.VITE_OPENROUTER_API_KEY ||
        "",
    ),
    __SERVER_OPENROUTER_DEFAULT_MODEL__: JSON.stringify(
      process.env.OPENROUTER_DEFAULT_MODEL ||
        process.env.VITE_OPENROUTER_DEFAULT_MODEL ||
        "z-ai/glm-5.3-flash",
    ),
  },
  rollupConfig: {
    external: ["pdfjs-dist"],
  },
});
