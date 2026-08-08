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
        apiKey: env.FIREBASE_API_KEY || "",
        authDomain: env.FIREBASE_AUTH_DOMAIN || "",
        projectId: env.FIREBASE_PROJECT_ID || "",
        storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
        appId: env.FIREBASE_APP_ID || "",
        measurementId: env.FIREBASE_MEASUREMENT_ID || "",
      }),
      __OPENROUTER_DEFAULT_KEY__: JSON.stringify(
        env.OPENROUTER_API_KEY ||
          process.env.OPENROUTER_API_KEY ||
          env.VITE_OPENROUTER_API_KEY ||
          process.env.VITE_OPENROUTER_API_KEY ||
          "",
      ),
      __OPENROUTER_DEFAULT_MODEL__: JSON.stringify(
        env.OPENROUTER_DEFAULT_MODEL ||
          process.env.OPENROUTER_DEFAULT_MODEL ||
          env.VITE_OPENROUTER_DEFAULT_MODEL ||
          process.env.VITE_OPENROUTER_DEFAULT_MODEL ||
          "",
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
            const relativePath = `.${pathName}.ts`;
            try {
              const mod = await server.ssrLoadModule(relativePath);
              if (mod && mod.default) {
                // Ensure res.status & res.json exist
                res.json = (data: any) => {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                };
                res.status = (code: number) => {
                  res.statusCode = code;
                  return res;
                };

                if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
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
            } catch (err: any) {
              console.error(`Dev API error for ${pathName}:`, err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }
          next();
        });
      },
    },
    ...(isVercel
      ? [
          nitro({
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
