// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { loadEnv } from "vite";

// Load ALL env vars (including non-VITE_ prefixed) from .env files
// The empty string prefix '' means "load all", not just VITE_-prefixed
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");

const isVercel = process.env.VERCEL === "1" || env.VERCEL === "1";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: {},
    prerender: {
      enabled: false,
    },
  },
  vite: {
    // Inject Firebase config at build time from server-side env vars.
    // These are NOT prefixed with VITE_ so Vite won't auto-expose them.
    // The `define` option replaces the identifier at compile time, embedding
    // the values into the minified bundle — no separate network request.
    define: {
      __FIREBASE_CONFIG__: JSON.stringify({
        apiKey: process.env.FIREBASE_API_KEY || env.FIREBASE_API_KEY || "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId:
          process.env.FIREBASE_MESSAGING_SENDER_ID || env.FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.FIREBASE_APP_ID || env.FIREBASE_APP_ID || "",
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || env.FIREBASE_MEASUREMENT_ID || "",
      }),
      __OPENROUTER_DEFAULT_KEY__: JSON.stringify(
        process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || "",
      ),
      __OPENROUTER_DEFAULT_MODEL__: JSON.stringify(
        process.env.OPENROUTER_DEFAULT_MODEL || env.OPENROUTER_DEFAULT_MODEL || "",
      ),
      __OMNIROUTER_BASE_URL__: JSON.stringify(
        process.env.OMNIROUTER_BASE_URL || env.OMNIROUTER_BASE_URL || "",
      ),
      __OMNIROUTER_API_KEY__: JSON.stringify(
        process.env.OMNIROUTER_API_KEY || env.OMNIROUTER_API_KEY || "",
      ),
      __OMNIROUTER_DEFAULT_MODEL__: JSON.stringify(
        process.env.OMNIROUTER_DEFAULT_MODEL || env.OMNIROUTER_DEFAULT_MODEL || "",
      ),
      __RAZORPAY_KEY_ID__: JSON.stringify(
        process.env.RAZORPAY_KEY_ID ||
          env.RAZORPAY_KEY_ID ||
          process.env.VITE_RAZORPAY_KEY_ID ||
          env.VITE_RAZORPAY_KEY_ID ||
          "rzp_live_TVWs5Qr4BXQH9u",
      ),
    },
    ssr: {
      external: ["pdfjs-dist"],
    },
    environments: {
      nitro: {
        resolve: {
          external: ["pdfjs-dist"],
        },
      },
    },
  },
  plugins: [
    {
      name: "vercel-api-dev-plugin",
      configureServer(server: any) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          const url = req.url || "";
          if (url.startsWith("/api/")) {
            const pathName = url.split("?")[0];
            const method = (req.method || "GET").toLowerCase();
            const candidates = [
              `./server${pathName}.${method}.ts`,
              `./server${pathName}.ts`,
              `./server${pathName}/index.ts`,
              `.${pathName}.ts`,
            ];

            let mod: any = null;
            for (const candidate of candidates) {
              try {
                mod = await server.ssrLoadModule(candidate);
                if (mod && mod.default) break;
              } catch {
                // Try next candidate
              }
            }

            if (mod && mod.default) {
              try {
                const { createApp } = await import("h3");
                const { toNodeHandler } = await import("h3/node");
                const app = createApp().use(mod.default);
                const nodeHandler = toNodeHandler(app);
                return await nodeHandler(req, res);
              } catch {
                // Fallback to direct call if not an H3 event handler
                res.json = (data: any) => {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                };
                res.status = (code: number) => {
                  res.statusCode = code;
                  return res;
                };

                if (
                  req.method === "POST" ||
                  req.method === "PUT" ||
                  req.method === "PATCH" ||
                  req.method === "DELETE"
                ) {
                  let bodyStr = "";
                  req.on("data", (chunk: any) => {
                    bodyStr += chunk;
                  });
                  req.on("end", async () => {
                    try {
                      req.body = bodyStr ? JSON.parse(bodyStr) : {};
                    } catch {
                      req.body = {};
                    }
                    await mod.default(req, res);
                  });
                  return;
                }
                await mod.default(req, res);
                return;
              }
            }
          }
          next();
        });
      },
    },
    ...(isVercel
      ? [
          nitro({
            scanDirs: ["server"],
            vercel: {
              functions: {
                runtime: "nodejs22.x",
              },
            },
            rollupConfig: {
              external: ["pdfjs-dist"],
            },
          }),
        ]
      : []),
  ],
});
