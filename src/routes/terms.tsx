import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, CheckCircle2, ShieldAlert, Mail, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Anuwad" },
      {
        name: "description",
        content:
          "Terms of Service for Anuwad (anuwad.com). Review terms governing the use of our AI document reader, translation features, and user obligations.",
      },
      { property: "og:title", content: "Terms of Service — Anuwad" },
      {
        property: "og:description",
        content:
          "Terms of Service for Anuwad. Review terms governing document reading, translation, and user accounts.",
      },
      { property: "og:url", content: "https://www.anuwad.com/terms" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/terms" }],
  }),
});

function TermsOfServicePage() {
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
                Terms
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/privacy"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Privacy Policy
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
            <FileText className="h-3.5 w-3.5" />
            <span>Legal Agreement</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Effective Date & Last Updated: <span className="font-semibold text-foreground">{lastUpdated}</span>
          </p>
          <p className="mt-4 text-base text-foreground/80 leading-relaxed max-w-3xl">
            These Terms of Service ("Terms") govern your access to and use of the website located at{" "}
            <strong className="text-foreground">Anuwad.com</strong> ("Anuwad", "we", "us", or "our") 
            and all associated applications, services, and tools. By accessing or using Anuwad, you agree to comply with and be bound by these Terms.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-10 text-sm leading-relaxed text-foreground/85">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                1
              </span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, or using Anuwad.com or registering an account via Google OAuth, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you must not use our services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                2
              </span>
              Description of Service
            </h2>
            <p>
              Anuwad provides a browser-based AI document reading, page-by-page translation, text-to-speech audio synthesis, and document management platform. Features include local document storage, pipeline inspection, and multi-language support. We reserve the right to modify, update, or discontinue features of the service at any time.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                3
              </span>
              User Accounts & Google Authentication
            </h2>
            <p>
              You may access certain features by authenticating through your Google Account via Google OAuth. You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Maintaining the security and confidentiality of your login credentials.</li>
              <li>All activities that occur under your authenticated session.</li>
              <li>Notifying us immediately of any unauthorized use or security breach involving your account.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                4
              </span>
              User Content & Ownership
            </h2>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="font-semibold text-foreground">Your Documents Belong To You:</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                You retain all intellectual property rights and ownership of all documents, PDFs, text, and files uploaded or processed using Anuwad. Anuwad claims no ownership or control over your uploaded content. You represent and warrant that you own or have the necessary licenses and permissions for any files you upload.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                5
              </span>
              Acceptable Use Policy
            </h2>
            <p>You agree not to use Anuwad to:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Upload or process illegal, harmful, defamatory, infringing, or malicious content.</li>
              <li>Attempt to reverse engineer, decompile, or interfere with the infrastructure or operational integrity of the site.</li>
              <li>Automate excessive API queries that cause intentional service degradation for other users.</li>
              <li>Violate applicable local, national, or international laws and regulations.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                6
              </span>
              AI Translations & Accuracy Disclaimer
            </h2>
            <p>
              Translations and text extraction provided by Anuwad rely on automated machine learning models and artificial intelligence. While we strive for accuracy, AI translations are provided for informational and convenience purposes. Anuwad does not guarantee 100% precision or accuracy in translated content and shall not be held liable for errors in machine translation.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                7
              </span>
              Disclaimer of Warranties & Limitation of Liability
            </h2>
            <div className="rounded-xl border border-border bg-surface-2/40 p-5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span>Provided "AS IS"</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ANUWAD IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ANUWAD AND ITS DEVELOPERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                8
              </span>
              Termination & Governing Law
            </h2>
            <p>
              We reserve the right to suspend or terminate account access for users who violate these Terms. These Terms are governed by applicable laws without regard to conflict of law principles.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-xs font-mono font-semibold text-primary">
                9
              </span>
              Contact Information
            </h2>
            <div className="rounded-xl border border-border bg-surface-2/40 p-5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-bold text-foreground">Questions about our Terms of Service?</p>
                <p className="text-xs text-muted-foreground">Reach out to the Anuwad administrative team.</p>
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
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-foreground font-semibold">
              Terms of Service
            </Link>
          </div>
          <p>© {new Date().getFullYear()} Anuwad.com — All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
