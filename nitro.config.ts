import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  scanDirs: ["server"],
  rollupConfig: {
    external: ["pdfjs-dist"],
  },
});
