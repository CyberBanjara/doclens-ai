import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { initTheme } from "@/lib/theme";

import appCss from "../styles.css?url";
import { TtsProvider } from "@/context/TtsContext";
import { AuthProvider } from "@/context/AuthContext";

import { NotFoundComponent } from "@/components/NotFound";
import { AdBannerWidget } from "@/components/AdBannerWidget";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Anuwad — Private PDF Reader & Translator" },
      {
        name: "description",
        content:
          "Anuwad is a free, private, browser-only PDF reader with AI translation and document pipeline inspection. Nothing leaves your device.",
      },
      {
        name: "keywords",
        content:
          "Anuwad, Anuwad.com, private PDF reader, browser PDF translator, PDF pipeline inspector, offline PDF reader, AI document reader, AI PDF translator",
      },
      { name: "author", content: "Anuwad" },
      { property: "og:site_name", content: "Anuwad" },
      {
        property: "og:title",
        content: "Anuwad — Private PDF Reader & Translator",
      },
      {
        property: "og:description",
        content:
          "Free, browser-only PDF reader with AI translation. 100% local — nothing leaves your device.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.anuwad.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Anuwad — Private PDF Reader & Translator",
      },
      {
        name: "twitter:description",
        content:
          "Free, browser-only PDF reader with AI translation. 100% local — nothing leaves your device.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://www.anuwad.com/" },
      {
        rel: "icon",
        type: "image/png",
        href: "/light_13746323.png",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  ssr: false,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function() {
            try {
              var theme = localStorage.getItem('doclens-theme') || 'system';
              var isDark = false;
              if (theme === 'system') {
                var hour = new Date().getHours();
                isDark = !(hour >= 6 && hour < 18);
              } else {
                var darkThemes = ['apple-dark', 'dark', 'ocean', 'forest', 'sunset', 'sea', 'mint'];
                isDark = darkThemes.indexOf(theme) !== -1;
              }
              var bg = isDark ? '#0b1326' : '#f5f5f7';
              var color = isDark ? '#ffffff' : '#1d1d1f';
              var root = document.documentElement;
              root.style.setProperty('--preloader-bg', bg);
              root.style.setProperty('--preloader-color', color);
              if (isDark) {
                root.classList.add('dark');
              } else {
                root.classList.remove('dark');
              }
            } catch (e) {}
          })();
        `,
          }}
        />
      </head>
      <body>
        <div
          id="preloader"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "var(--preloader-bg, #0b1326)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            transition: "opacity 0.4s ease, visibility 0.4s ease",
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "24px",
              animation: "preloader-fade-in 0.6s ease-out",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "96px",
                height: "96px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: "50%",
                  border: "2px solid var(--preloader-color, #ffffff)",
                  opacity: 0.15,
                  animation: "preloader-pulse 2s infinite ease-in-out",
                }}
              ></div>
              <img
                src="/light_13746323.png"
                alt="Anuwad Logo"
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain",
                  animation: "preloader-logo-pulse 2s infinite ease-in-out",
                  zIndex: 2,
                }}
              />
            </div>
            <div
              style={{
                color: "var(--preloader-color, #ffffff)",
                fontSize: "20px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                opacity: 0.9,
                animation: "preloader-pulse-text 2s infinite ease-in-out",
              }}
            >
              Anuwad
            </div>
            <div
              style={{
                width: "120px",
                height: "3px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                borderRadius: "3px",
                overflow: "hidden",
                position: "relative",
              }}
              className="preloader-progress-container"
            >
              <div
                style={{
                  position: "absolute",
                  height: "100%",
                  width: "50%",
                  background:
                    "linear-gradient(90deg, transparent, var(--preloader-color, #ffffff), transparent)",
                  animation: "preloader-loading 1.5s infinite linear",
                }}
              ></div>
            </div>
          </div>
        </div>

        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes preloader-fade-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes preloader-pulse {
            0% { transform: scale(0.9); opacity: 0.1; }
            50% { transform: scale(1.1); opacity: 0.25; }
            100% { transform: scale(0.9); opacity: 0.1; }
          }
          @keyframes preloader-logo-pulse {
            0% { transform: scale(0.96); filter: drop-shadow(0 0 8px rgba(255,255,255,0)); }
            50% { transform: scale(1.04); filter: drop-shadow(0 0 16px rgba(255,255,255,0.25)); }
            100% { transform: scale(0.96); filter: drop-shadow(0 0 8px rgba(255,255,255,0)); }
          }
          @keyframes preloader-pulse-text {
            0% { opacity: 0.6; }
            50% { opacity: 0.95; }
            100% { opacity: 0.6; }
          }
          @keyframes preloader-loading {
            0% { left: -50%; }
            100% { left: 100%; }
          }
          html:not(.dark) .preloader-progress-container {
            background-color: rgba(0, 0, 0, 0.05) !important;
          }
        `,
          }}
        />
        {/* Pre-rendered static semantic block for Google OAuth Verification & Crawlers */}
        <header className="sr-only" aria-hidden="false">
          <h1>Anuwad — AI Document Reader &amp; Translator</h1>
          <p>
            Anuwad is a free, privacy-first document platform. Render PDFs locally in your browser,
            translate pages into over 90 languages using state-of-the-art AI, and convert text into
            natural speech. Sign in with Google to synchronize your saved document library and
            preferences securely across devices.
          </p>
          <nav>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </nav>
        </header>

        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const location = useLocation();

  useEffect(() => {
    initTheme();

    // Hide and remove preloader once React application is fully mounted, keeping it for at least 2 seconds
    const preloader = document.getElementById("preloader");
    if (!preloader) return;

    let removeTimer: NodeJS.Timeout;

    const fadeTimer = setTimeout(() => {
      preloader.style.opacity = "0";
      preloader.style.visibility = "hidden";

      removeTimer = setTimeout(() => {
        preloader.remove();
      }, 400); // Matches the 0.4s transition duration
    }, 2000); // 2 seconds minimum visibility

    return () => {
      clearTimeout(fadeTimer);
      if (removeTimer) {
        clearTimeout(removeTimer);
      }
    };
  }, []);

  return (
    <AuthProvider>
      <TtsProvider>
        <Outlet />
        <AdBannerWidget />
        <ApiKeyModal />
        <Analytics />
        <SpeedInsights />
        <Toaster position="bottom-right" richColors closeButton />
      </TtsProvider>
    </AuthProvider>
  );
}
