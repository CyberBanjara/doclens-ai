import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, CheckCircle2, Lock, Mail, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Anuwad" },
      {
        name: "description",
        content:
          "Privacy Policy for Anuwad (anuwad.com). Learn how we handle your data, Google OAuth credentials, and maintain 100% data sovereignty.",
      },
      { property: "og:title", content: "Privacy Policy — Anuwad" },
      {
        property: "og:description",
        content:
          "Privacy Policy for Anuwad. Learn how we handle your data, Google OAuth, and maintain data sovereignty.",
      },
      { property: "og:url", content: "https://www.anuwad.com/privacy" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/privacy" }],
  }),
});

function PrivacyPolicyPage() {
  const lastUpdated = "August 1, 2026";
  const contactEmail = "banjaracyber@gmail.com";

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/light_13746323.png"
              alt="Anuwad Logo"
              className="h-9 w-9 object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
            />
            <div>
              <span className="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                Anuwad
              </span>
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary font-semibold">
                Privacy
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/terms"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Terms of Service
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        {/* Hero Section */}
        <div className="mb-12 border-b border-border pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-4">
            <Shield className="h-3.5 w-3.5" />
            <span>Official Policy & Compliance</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective Date & Last Updated:{" "}
            <span className="font-semibold text-foreground">{lastUpdated}</span>
          </p>
          <p className="mt-4 text-base text-foreground/80 leading-relaxed max-w-3xl">
            Welcome to <strong className="text-foreground">Anuwad.com</strong> ("Anuwad", "we",
            "us", or "our"). We respect your privacy and are committed to protecting your personal
            data and uploaded documents. This Privacy Policy explains how we collect, use, store,
            and safeguard your information when you access or use our application, including logins
            performed via <strong className="text-foreground">Google OAuth</strong>.
          </p>
        </div>

        {/* Highlight Card for Google OAuth Compliance */}
        <div className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-2.5 text-primary shrink-0 mt-0.5">
              <Lock className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-foreground">
                Google API Services User Data Policy Compliance
              </h3>
              <p className="text-xs sm:text-sm text-foreground/85 leading-relaxed">
                Anuwad's use and transfer to any other app of information received from Google APIs
                will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-0.5"
                >
                  Google API Services User Data Policy
                  <ExternalLink className="h-3 w-3 inline ml-0.5" />
                </a>
                , including the{" "}
                <strong className="text-foreground font-semibold">Limited Use requirements</strong>.
                We do not sell, share, or monetize your Google OAuth data or uploaded documents.
              </p>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-10 text-sm leading-relaxed text-foreground/85">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                1
              </span>
              Information We Collect
            </h2>
            <p>
              When you interact with Anuwad.com, we collect limited information necessary to
              authenticate your account and provide our AI document reading and translation
              services:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Google OAuth Data:</strong> When you sign in
                using Google, we retrieve basic profile details provided by Google OAuth, including
                your email address, full name, and profile avatar URL.
              </li>
              <li>
                <strong className="text-foreground">Document & Content Files:</strong> PDFs and
                documents uploaded to Anuwad are stored in your browser's local IndexedDB database.
                If you are signed in, document configurations and translation records may be synced
                to secure cloud storage (Firebase Firestore/Storage) associated with your
                authenticated account.
              </li>
              <li>
                <strong className="text-foreground">Technical & Usage Data:</strong> We may collect
                standard client metadata (browser type, device type, page view analytics) to
                optimize application performance and diagnose technical issues.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                2
              </span>
              How We Use Your Information
            </h2>
            <p>We use the information we collect strictly for the following purposes:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Authentication</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  To securely identify your account and grant access to your saved document library
                  across sessions.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Translation & TTS</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  To process PDF page text for AI translation and synthesize text-to-speech audio
                  upon your request.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Cloud Synchronization</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  To synchronize user settings, document metadata, and review ratings attached to
                  your user ID.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Product Improvement</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  To analyze application performance, debug crashes, and enhance feature
                  functionality.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                3
              </span>
              Data Protection & Zero Third-Party Selling
            </h2>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="font-semibold text-foreground">
                We maintain a strict policy against data monetization:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
                <li>
                  We{" "}
                  <strong className="text-foreground">DO NOT sell, rent, trade, or transfer</strong>{" "}
                  your personal data or Google account information to any third parties or ad
                  brokers.
                </li>
                <li>
                  We <strong className="text-foreground">DO NOT use</strong> your Google account
                  data or uploaded document content to train generalized artificial intelligence or
                  machine learning models.
                </li>
                <li>
                  We <strong className="text-foreground">DO NOT serve advertisements</strong> using
                  tracking pixels based on your personal information.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                4
              </span>
              Third-Party Service Providers
            </h2>
            <p>
              Anuwad utilizes trusted third-party infrastructure providers solely to host,
              authenticate, and run the service:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Google Firebase / Cloud:</strong> Used for
                secure user authentication (Google Sign-In) and storing application backend data.
              </li>
              <li>
                <strong className="text-foreground">OpenRouter:</strong> Used to interface with AI
                models for document translation. Only the extracted text of the specific page being
                translated is transmitted to OpenRouter endpoints.
              </li>
              <li>
                <strong className="text-foreground">Vercel & Analytics:</strong> Used for web
                application hosting, speed insights, and anonymous telemetry.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                5
              </span>
              Data Sovereignty, Control & Deletion
            </h2>
            <p>
              You maintain full sovereignty over your data. You can delete individual documents or
              clear local browser storage at any time directly through the application settings.
            </p>
            <p>
              To request full deletion of your user account, Google OAuth authentication tokens, and
              any stored cloud data, please send an email to{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                {contactEmail}
              </a>
              . We will process data deletion requests within 30 days.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                6
              </span>
              Contact Information
            </h2>
            <div className="rounded-xl border border-border bg-surface-2/40 p-5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-bold text-foreground">
                  Have questions about this Privacy Policy?
                </p>
                <p className="text-xs text-muted-foreground">
                  Contact the Anuwad development & privacy team directly.
                </p>
              </div>
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all shadow-sm"
              >
                <Mail className="h-4 w-4" />
                <span>{contactEmail}</span>
              </a>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-border pt-8 text-center text-xs text-muted-foreground">
          <div className="flex justify-center gap-6 mb-4">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/privacy" className="text-foreground font-semibold">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
          <p>© {new Date().getFullYear()} Anuwad.com — All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
