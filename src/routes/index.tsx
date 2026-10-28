import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  GraduationCap,
  Headphones,
  Languages,
  Layers,
  Lock,
  Pause,
  Play,
  ScanText,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { createDoc, StorageError } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      {
        title: "Anuwad — Private PDF Translation, AI Document Reader & Neural Text-to-Speech",
      },
      {
        name: "description",
        content:
          "Read, translate, and listen to textbooks and documents in 90+ languages. 100% private in-browser document workspace with side-by-side translation, client-side OCR, and natural neural text-to-speech.",
      },
      {
        name: "keywords",
        content:
          "Anuwad, PDF translation, AI document reader, private PDF reader, neural text-to-speech, browser PDF translator, NCERT textbook translation, multilingual reading, OCR PDF reader, accessible learning, book translation",
      },
      { name: "author", content: "Anuwad" },
      { rel: "canonical", href: "https://www.anuwad.com/" },

      // Open Graph Metadata
      {
        property: "og:title",
        content: "Anuwad — Private PDF Translation, AI Reader & Neural Text-to-Speech",
      },
      {
        property: "og:description",
        content:
          "Democratizing knowledge across languages. Read PDFs, textbooks, and research in 90+ languages with side-by-side translation and neural speech — 100% locally in your browser.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.anuwad.com/" },
      { property: "og:site_name", content: "Anuwad" },
      { property: "og:image", content: "https://www.anuwad.com/light_13746323.png" },
      { property: "og:locale", content: "en_US" },

      // Twitter Cards
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Anuwad — Private PDF Translation, AI Reader & Neural Text-to-Speech",
      },
      {
        name: "twitter:description",
        content:
          "Read, translate, and listen to documents in your mother tongue. Browser-native, 100% private, with complete NCERT curriculum library.",
      },
      { name: "twitter:image", content: "https://www.anuwad.com/light_13746323.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://www.anuwad.com/#website",
              url: "https://www.anuwad.com/",
              name: "Anuwad",
              description:
                "Private browser-based document intelligence, PDF translation, and neural text-to-speech platform.",
              publisher: {
                "@id": "https://www.anuwad.com/#organization",
              },
              inLanguage: ["en", "hi", "bn", "ta", "te", "mr", "es", "fr", "de"],
            },
            {
              "@type": "Organization",
              "@id": "https://www.anuwad.com/#organization",
              name: "Anuwad",
              url: "https://www.anuwad.com/",
              logo: "https://www.anuwad.com/light_13746323.png",
              description:
                "Democratizing access to literature, curriculum, and research across languages through local-first browser AI.",
            },
            {
              "@type": "SoftwareApplication",
              "@id": "https://www.anuwad.com/#software",
              name: "Anuwad Document Workspace",
              applicationCategory: "EducationalApplication",
              operatingSystem: "Web Browser",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              featureList: [
                "Browser-native PDF rendering with PDF.js and Canvas",
                "Context-aware neural translation into 90+ languages",
                "Synchronized side-by-side bilingual reading view",
                "WebAssembly Piper neural text-to-speech audio reader",
                "Client-side Tesseract.js OCR for scanned and damaged PDFs",
                "Curated NCERT curriculum library for Classes 1 to 12",
                "100% private IndexedDB local document storage",
              ],
            },
            {
              "@type": "FAQPage",
              "@id": "https://www.anuwad.com/#faq",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "How does Anuwad protect my document privacy?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Anuwad operates with a local-first browser architecture. Your PDF files are parsed directly inside your browser memory using PDF.js and stored on your device using IndexedDB. Unlike conventional translation tools, your original files never leave your device without explicit consent.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Which languages are supported for translation and text-to-speech?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Anuwad supports over 90 languages for contextual AI translation, with specialized support for Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Odia, Punjabi, Urdu) and major global languages (Spanish, French, German, Japanese, Chinese, Arabic, Russian). Text-to-speech is provided via high-clarity Piper WebAssembly neural voices and native browser speech synthesis.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can Anuwad translate scanned or photocopy PDFs with OCR?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Anuwad includes an integrated client-side OCR fallback powered by Tesseract.js. When a document page has garbled character encodings or contains scanned image text, Anuwad automatically detects the issue and executes optical character recognition locally before generating translations.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What is the Global Library in Anuwad?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "The Global Library is a curated, open-access repository of standard Indian curriculum textbooks (NCERT) covering Classes 1 through 12 across disciplines such as Science, Mathematics, Social Studies, and English. Students and educators can open and translate any chapter into their mother tongue with a single click.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is Anuwad free to use, and do I need an account?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Anuwad is free and accessible without mandatory account registration. You can upload and read documents immediately in your browser. An optional Google sign-in is available if you wish to synchronize reading progress and bookmarks across devices.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I use Anuwad offline?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Once documents and neural TTS voice packages are cached in your browser's IndexedDB and service storage, you can view, navigate, and listen to previously loaded documents without an active internet connection.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
});

// Interactive sample data demonstrating authentic translation across multiple languages
interface SampleLanguageData {
  name: string;
  nativeName: string;
  badge: string;
  translatedTitle: string;
  translatedExcerpt: string;
  simplifiedExcerpt: string;
  audioDuration: string;
  translationNotes: string;
}

const SAMPLE_LANGUAGES: Record<string, SampleLanguageData> = {
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    badge: "Official Vernacular",
    translatedTitle: "अध्याय 10: प्रकाश — परावर्तन तथा अपवर्तन",
    translatedExcerpt:
      "हम इस संसार में अपने चारों ओर विभिन्न प्रकार की वस्तुएँ देखते हैं। किसी अंधेरे कमरे में हम कुछ भी देखने में असमर्थ होते हैं। कमरे को प्रकाशित करने पर वस्तुएँ दिखाई देने लगती हैं। वस्तुएँ प्रकाश को परावर्तित करती हैं, और यह परावर्तित प्रकाश जब हमारी आँखों द्वारा ग्रहण किया जाता है, तो हमें वस्तुओं को देखने में समर्थ बनाता है।",
    simplifiedExcerpt:
      "[सरलीकृत व्याख्या]: वस्तुएँ तभी दिखाई देती हैं जब उन पर पड़ने वाला प्रकाश परावर्तित होकर हमारी आँखों में प्रवेश करता है। अंधेरे में प्रकाश न होने के कारण परावर्तन संभव नहीं होता।",
    audioDuration: "0:24",
    translationNotes:
      "Retains official NCERT scientific nomenclature ('परावर्तन' for reflection, 'अपवर्तन' for refraction).",
  },
  bn: {
    name: "Bengali",
    nativeName: "বাংলা",
    badge: "Regional Curriculum",
    translatedTitle: "অধ্যায় ১০: আলো — প্রতিফলন ও প্রতিসরণ",
    translatedExcerpt:
      "আমরা এই সুন্দর পৃথিবীতে আমাদের চারপাশে বিভিন্ন রকমের বস্তু দেখতে পাই। একটি অন্ধকার ঘরে আমরা কিছুই দেখতে পাই না। ঘরটিতে আলো জ্বালালে চারপাশের জিনিসপত্র দৃশ্যমান হয়ে ওঠে। বস্তুগুলো আলো প্রতিফলন করে, এবং এই প্রতিফলিত আলো যখন আমাদের চোখের দ্বারা গৃহীত হয়, তখন আমরা বস্তুগুলোকে স্পষ্টভাবে দেখতে পাই।",
    simplifiedExcerpt:
      "[সরলীকৃত ব্যাখ্যা]: আলো যখন কোনো বস্তুর ওপর পড়ে এবং সেখান থেকে প্রতিফলিত হয়ে আমাদের চোখে এসে পৌঁছায়, কেবল তখনই আমরা সেই বস্তুটি স্পষ্টভাবে দেখতে পাই।",
    audioDuration: "0:26",
    translationNotes:
      "Standard Bengali academic prose with authentic optical terminology ('প্রতিফলন' and 'প্রতিসরণ').",
  },
  ta: {
    name: "Tamil",
    nativeName: "தமிழ்",
    badge: "Classical Language",
    translatedTitle: "அத்தியாயம் 10: ஒளி — எதிரொளிப்பு மற்றும் ஒளிவிலகல்",
    translatedExcerpt:
      "நாம் இந்த உலகில் நம்மைச் சுற்றியுள்ள பல்வேறு வகையான பொருட்களைக் காண்கிறோம். இருண்ட அறையில் நாம் எதையும் பார்க்க முடிவதில்லை. அறை ஒளிரூட்டப்படும் போது பொருட்கள் கண்ணுக்குத் தெரிகின்றன. பொருட்கள் ஒளியை எதிரொளிக்கின்றன; அந்த எதிரொளிக்கப்பட்ட ஒளி நமது கண்களை அடையும் போது, நாம் அப்பொருட்களைக் காண முடிகிறது.",
    simplifiedExcerpt:
      "[எளிமைப்படுத்தப்பட்ட விளக்கம்]: ஒளி ஒரு பொருளின் மீது பட்டு மீண்டும் எதிரொளித்து நமது கண்களை அடையும் போது மட்டுமே நம்மால் அப்பொருளைத் தெளிவாகக் காண இயலும்.",
    audioDuration: "0:28",
    translationNotes:
      "Accurate Tamil physics terminology ('எதிரொளிப்பு' for reflection, 'ஒளிவிலகல்' for refraction).",
  },
  mr: {
    name: "Marathi",
    nativeName: "मराठी",
    badge: "State Curriculum",
    translatedTitle: "प्रकरण १०: प्रकाश — परावर्तन आणि अपवर्तन",
    translatedExcerpt:
      "आपण या जगात आपल्या सभोवताली विविध प्रकारच्या वस्तू पाहतो. अंधाऱ्या खोलीत आपल्याला काहीही पाहता येत नाही. खोलीमध्ये प्रकाश आल्यावर वस्तू दिसू लागतात. वस्तू प्रकाशाचे परावर्तन करतात आणि हा परावर्तित प्रकाश जेव्हा आपल्या डोळ्यांपर्यंत पोहोचतो, तेव्हा आपल्याला वस्तू दिसतात.",
    simplifiedExcerpt:
      "[सरलीकृत स्पष्टीकरण]: जेव्हा प्रकाश एखाद्या वस्तूवर पडून परावर्तित होतो आणि आपल्या डोळ्यांपर्यंत येतो, तेव्हाच आपल्याला ती वस्तू प्रत्यक्षात दिसते.",
    audioDuration: "0:25",
    translationNotes:
      "Natural Marathi scientific diction maintaining parity with state board physics textbooks.",
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    badge: "Global Language",
    translatedTitle: "Capítulo 10: Luz — Reflexión y Refracción",
    translatedExcerpt:
      "Vemos una gran variedad de objetos en el mundo que nos rodea. Sin embargo, en una habitación oscura no podemos ver nada. Al encender la luz, los objetos se vuelven visibles. Los objetos reflejan la luz que incide sobre ellos, y cuando esta luz reflejada es percibida por nuestros ojos, nos permite observar el entorno.",
    simplifiedExcerpt:
      "[Explicación simplificada]: Los objetos solo se hacen visibles cuando la luz incide sobre ellos y se refleja directamente hacia nuestros ojos, permitiendo la percepción visual.",
    audioDuration: "0:22",
    translationNotes:
      "Clear, academic Spanish prose preserving conceptual precision for international STEM readers.",
  },
};

const FAQS = [
  {
    q: "How does Anuwad protect my document privacy?",
    a: "Anuwad is engineered from the ground up as a browser-first, privacy-respecting platform. When you open a PDF, it is rendered directly within your local browser environment using PDF.js and stored in IndexedDB on your device. Your original document files never leave your computer or phone. Unlike traditional cloud translation portals that store and inspect your files, Anuwad ensures complete local data ownership.",
  },
  {
    q: "What languages does Anuwad support for translation and audio?",
    a: "Anuwad supports more than 90 global and regional languages. It excels in Indian vernacular languages including Hindi (हिन्दी), Bengali (বাংলা), Tamil (தமிழ்), Telugu (తెలుగు), Marathi (मराठी), Gujarati (ગુજરાતી), Kannada (ಕನ್ನಡ), Malayalam (മലയാളം), Odia (ଓଡ଼ିଆ), Punjabi (ਪੰਜਾਬੀ), and Urdu (اردو), alongside major international languages like Spanish, French, German, Japanese, Chinese, and Arabic. Audio playback is powered by Piper WebAssembly neural voices and native browser speech engines.",
  },
  {
    q: "How does the OCR feature work with scanned or photocopy PDFs?",
    a: "Many legacy PDFs, historical documents, and photocopied chapters lack digital text layers or have corrupted character mappings. Anuwad includes an automated client-side OCR fallback powered by Tesseract.js. When you open a page, Anuwad assesses text extractability and garbage character ratios. If the text layer is unreadable, it runs optical character recognition directly in browser Web Workers to extract clean text before translation.",
  },
  {
    q: "What is the Global Library, and who can access it?",
    a: "The Global Library is a curated collection of standard open curriculum textbooks published by the National Council of Educational Research and Training (NCERT) for Classes 1 through 12. It covers core academic subjects including Science, Mathematics, History, Civics, Geography, and Economics. Anyone can browse, open, and translate any chapter into their mother tongue with zero download friction.",
  },
  {
    q: "Can I use Anuwad for academic research and professional work?",
    a: "Yes. Anuwad provides multiple comprehension styles, including 'Natural Translation' for faithful rendering, 'Academic Explanation' for research clarification, and adjustable education levels (School Student, College Undergrad, Domain Expert). Researchers and professionals frequently use Anuwad to parse multi-column preprints, patents, legal contracts, and historical manuscripts without compromising confidentiality.",
  },
  {
    q: "Is Anuwad completely free to use? Do I need to create an account?",
    a: "Anuwad is free to use without requiring an account or credit card. You can simply drag and drop any PDF to start reading immediately. An optional Google sign-in is provided solely for users who wish to synchronize their personal reading library, bookmarks, and style preferences across multiple devices.",
  },
];

function HomePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLang, setSelectedLang] = useState<string>("hi");
  const [readingStyle, setReadingStyle] = useState<"natural" | "simplified">("natural");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleProcessFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please select a valid PDF file.");
        return;
      }

      try {
        const rec = await createDoc(file);
        navigate({ to: "/doc/$id", params: { id: rec.id } });
      } catch (e) {
        if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
          toast.error(e.message);
        } else {
          toast.error("Failed to process document. Please try again.");
          console.error(e);
        }
      }
    },
    [navigate],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
  };

  const currentSample = SAMPLE_LANGUAGES[selectedLang] || SAMPLE_LANGUAGES.hi;

  return (
    <SidebarLayout
      pageTitle="Anuwad"
      onNewDocument={handleProcessFile}
      topBarRight={
        <div className="hidden sm:flex items-center gap-3">
          <Link
            to="/global-library"
            preload="intent"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 hover:bg-surface-2 transition-all"
          >
            <Globe className="h-3.5 w-3.5 text-primary" />
            <span>NCERT Books</span>
          </Link>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-xs transition-all active:scale-95"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload PDF</span>
          </button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-14 space-y-20 sm:space-y-28 pb-32">
        {/* ══════════════════════════════════════════════════════════════
            HERO SECTION: Value Proposition & Direct Document Upload
           ══════════════════════════════════════════════════════════════ */}
        <section aria-label="Hero Introduction" className="space-y-10 text-center max-w-4xl mx-auto pt-2 sm:pt-6">
          {/* Subtle Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Browser-Native AI Document Workspace · 90+ Languages</span>
          </div>

          {/* Primary Heading (H1) */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground font-display leading-[1.12]">
              Read, Translate, and Listen in Your Mother Tongue.
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground font-normal leading-relaxed max-w-2xl mx-auto">
              Anuwad is a privacy-first document workspace that opens books, curriculum textbooks,
              and academic research to everyone. Translate complex PDFs side-by-side, extract text
              with local OCR, and listen with neural voices — without files ever leaving your device.
            </p>
          </div>

          {/* Interactive Document Dropzone / Launchpad */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-3xl border-2 border-dashed p-6 sm:p-10 transition-all duration-300 ${
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01] shadow-xl"
                : "border-border/80 bg-surface/50 hover:border-primary/50 hover:bg-surface-2/60 shadow-lg shadow-black/5"
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                <Upload className="h-8 w-8" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg sm:text-xl font-bold text-foreground">
                  Drop a PDF to start reading immediately
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                  Drag and drop any PDF here, or select a document from your device. Files stay
                  100% private in local browser storage.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose PDF Document</span>
                </button>

                <Link
                  to="/global-library"
                  preload="intent"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground hover:border-primary/50 hover:bg-surface-2 transition-all active:scale-95"
                >
                  <Globe className="h-4 w-4 text-primary" />
                  <span>Browse NCERT Textbooks</span>
                </Link>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Zero server uploads · IndexedDB encrypted storage · Up to 50MB</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2">
            <div className="rounded-2xl border border-border/70 bg-surface/40 p-4 text-center">
              <div className="text-2xl font-extrabold text-foreground font-display">100%</div>
              <div className="text-xs text-muted-foreground mt-0.5">Private &amp; In-Browser</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface/40 p-4 text-center">
              <div className="text-2xl font-extrabold text-foreground font-display">90+</div>
              <div className="text-xs text-muted-foreground mt-0.5">Languages Supported</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface/40 p-4 text-center">
              <div className="text-2xl font-extrabold text-foreground font-display">1–12</div>
              <div className="text-xs text-muted-foreground mt-0.5">NCERT School Grades</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface/40 p-4 text-center">
              <div className="text-2xl font-extrabold text-foreground font-display">Neural</div>
              <div className="text-xs text-muted-foreground mt-0.5">WebAssembly Speech</div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            THE PROBLEM SECTION: The Language-Accessibility Barrier
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="problem-heading" className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              The Language &amp; Access Dilemma
            </span>
            <h2
              id="problem-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              Why Vital Knowledge Remains Gated Behind Language Barriers
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Academic research, scientific textbooks, and cultural masterworks are heavily
              concentrated in English and select dominant tongues.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <Languages className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">The Vernacular Penalty</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Over 80% of peer-reviewed papers and modern curricula are authored in English. Yet
                more than 1.5 billion people learn, reason, and retain information most effectively
                in their mother tongue. Linguistic friction should never stand between a learner and
                their potential.
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">The Static PDF Trap</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                PDFs were invented as digital print replicas, not interactive reading surfaces.
                They fail responsive mobile layouts, resist screen readers, and image-based scans
                are impossible to copy or search. Traditional readers leave the user stranded with
                rigid pages.
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">The Cloud Privacy Compromise</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Standard web translators require uploading confidential research, unpublished
                manuscripts, or private legal records to corporate servers. Once uploaded, your data
                can be logged, indexed, or reviewed without your explicit control.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            HOW ANUWAD SOLVES IT: The 3-Step Reading Pipeline
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="pipeline-heading" className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              The Architecture
            </span>
            <h2
              id="pipeline-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              How Anuwad Transforms Static Documents
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              A 3-stage local intelligence pipeline engineered for high visual fidelity, academic
              depth, and absolute privacy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1 */}
            <div className="relative rounded-3xl border border-border/80 bg-surface/60 p-6 sm:p-8 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-primary px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                    STAGE 01
                  </span>
                  <ScanText className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  In-Browser Canvas &amp; Client-Side OCR
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  The document is rendered locally on HTML5 Canvas using PDF.js. Anuwad inspects
                  the text layer in real time. If the page is a photocopy, damaged, or scanned, our
                  client-side Tesseract.js WebAssembly engine automatically extracts clean text.
                </p>
              </div>
              <div className="pt-4 border-t border-border/50 text-[11px] font-medium text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Zero server transmission of original file</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-3xl border border-primary/40 bg-surface/70 p-6 sm:p-8 space-y-4 flex flex-col justify-between shadow-lg shadow-primary/5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-primary px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                    STAGE 02
                  </span>
                  <Languages className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  Dual-Pane Contextual AI Translation
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  State-of-the-art LLMs translate the text paragraph by paragraph into your chosen
                  language. Technical idioms, mathematical equations, and document structure are
                  meticulously preserved with synchronized side-by-side bilingual alignment.
                </p>
              </div>
              <div className="pt-4 border-t border-border/50 text-[11px] font-medium text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Natural &amp; simplified academic comprehension</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-3xl border border-border/80 bg-surface/60 p-6 sm:p-8 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-primary px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                    STAGE 03
                  </span>
                  <Headphones className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  Neural WebAssembly Speech Synthesis
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Listen to any chapter or document with high-clarity neural voice models powered by
                  Piper TTS in WebAssembly. Words are pronounced with natural phrasing, variable
                  reading speeds (0.75x–2.0x), and full offline playback capability.
                </p>
              </div>
              <div className="pt-4 border-t border-border/50 text-[11px] font-medium text-purple-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Multisensory auditory &amp; visual reading</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            AUTHENTIC INTERACTIVE PRODUCT PREVIEW / DEMONSTRATION
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="demo-heading" className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Live Product Demonstration
            </span>
            <h2
              id="demo-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              Experience the Dual-Pane Reader
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Explore how Anuwad renders an authentic NCERT textbook chapter. Switch languages and
              styles to see synchronized translation and neural audio in real time.
            </p>
          </div>

          <div className="rounded-3xl border border-border/90 bg-surface/80 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Demo Controls Bar */}
            <div className="border-b border-border bg-surface-2/70 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Language:</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(SAMPLE_LANGUAGES).map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedLang(key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedLang === key
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-surface border border-border/70 text-muted-foreground hover:text-foreground hover:bg-surface-2"
                      }`}
                    >
                      {item.nativeName} ({item.name})
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Style:</span>
                <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                  <button
                    onClick={() => setReadingStyle("natural")}
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-all ${
                      readingStyle === "natural"
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Natural
                  </button>
                  <button
                    onClick={() => setReadingStyle("simplified")}
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-all ${
                      readingStyle === "simplified"
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Simplified
                  </button>
                </div>
              </div>
            </div>

            {/* Split Screen Workspace Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Left Pane: Original Document */}
              <div className="p-6 sm:p-8 space-y-4 bg-background/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                    <span className="text-xs font-mono uppercase font-bold text-muted-foreground">
                      Original PDF Page (English)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground bg-surface-2 px-2 py-0.5 rounded border border-border">
                    NCERT Class 10 Science · Ch. 10
                  </span>
                </div>

                <div className="space-y-3 font-serif leading-relaxed text-sm sm:text-base text-foreground/90">
                  <h4 className="font-bold text-lg font-sans text-foreground">
                    Chapter 10: Light – Reflection and Refraction
                  </h4>
                  <p className="bg-surface/60 p-4 rounded-xl border border-border/60">
                    We see a variety of objects in the world around us. However, we are unable to
                    see anything in a dark room. On lighting up the room, things become visible. What
                    makes things visible? During the day, the sunlight helps us to see objects. An
                    object reflects light that falls on it. This reflected light, when received by
                    our eyes, enables us to see things.
                  </p>
                  <p className="text-xs text-muted-foreground font-sans italic">
                    Original text layer verified via PDF.js layout inspector.
                  </p>
                </div>
              </div>

              {/* Right Pane: Translated Output */}
              <div className="p-6 sm:p-8 space-y-4 bg-surface/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-mono uppercase font-bold text-emerald-500">
                      Translated Stream ({currentSample.nativeName})
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                    {currentSample.badge}
                  </span>
                </div>

                <div className="space-y-3 leading-relaxed text-sm sm:text-base text-foreground">
                  <h4 className="font-bold text-lg text-foreground font-display">
                    {currentSample.translatedTitle}
                  </h4>
                  <p className="bg-primary/5 p-4 rounded-xl border border-primary/20 text-foreground font-medium">
                    {readingStyle === "natural"
                      ? currentSample.translatedExcerpt
                      : currentSample.simplifiedExcerpt}
                  </p>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                    <span className="font-semibold text-foreground">Terminology Note:</span>
                    <span>{currentSample.translationNotes}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Neural TTS Interactive Player Bar */}
            <div className="border-t border-border bg-surface-2/90 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlayingAudio(!isPlayingAudio);
                    if (!isPlayingAudio) {
                      toast.info(`Simulating Piper Neural voice playback in ${currentSample.name}`);
                    }
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95"
                  aria-label={isPlayingAudio ? "Pause demo audio" : "Play demo audio"}
                >
                  {isPlayingAudio ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 ml-0.5" />
                  )}
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">
                      Piper Neural Audio · {currentSample.nativeName} Speech
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    WebAssembly ONNX synthesis · Natural human rhythm ({currentSample.audioDuration})
                  </span>
                </div>
              </div>

              {/* Audio Wave Simulation */}
              <div className="flex items-center gap-1 h-6">
                {[40, 75, 30, 90, 60, 45, 80, 50, 70, 35].map((height, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full bg-primary transition-all duration-300 ${
                      isPlayingAudio ? "animate-pulse" : "opacity-30"
                    }`}
                    style={{
                      height: isPlayingAudio ? `${height}%` : "30%",
                      animationDelay: `${idx * 100}ms`,
                    }}
                  />
                ))}
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-muted-foreground">Speed: 1.0x</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs font-mono font-medium text-emerald-500">Offline-Ready</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            CORE CAPABILITIES: In-Depth Technical Precision
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="features-heading" className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Full Feature Architecture
            </span>
            <h2
              id="features-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              Engineered for Serious Reading and Total Privacy
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Every component is built around local data control, visual clarity, and multi-lingual
              mastery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">100% In-Browser Privacy</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Documents are parsed and cached locally in your browser's IndexedDB. Your PDFs and
                notes remain strictly on your machine, eliminating corporate surveillance and leak
                risks.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Bilingual Split-Screen View</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Read the original document alongside the translated text in synchronous alignment.
                Cross-check technical terminology, verify context, and build bilingual vocabulary
                naturally.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <ScanText className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Client-Side OCR Engine</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Photocopied textbooks and scanned archival papers are handled seamlessly with
                embedded Tesseract.js WebAssembly OCR, extracting clean digital text without third-party
                APIs.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Volume2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Neural Piper Text-to-Speech</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Listen to translated documents with natural human cadence powered by WebAssembly
                neural voice engines. Enjoy adjustable pitch, rate, and sentence-level highlights.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <GraduationCap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Adaptive Reading Levels</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Tailor processing styles to your comprehension goal: choose Natural Translation for
                unaltered fidelity, or Simplified Explanation for school, undergraduate, or expert
                depth.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-7 space-y-3.5 hover:border-primary/40 hover:bg-surface-2/60 transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <Globe className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Pre-Indexed NCERT Library</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Direct access to the official Indian national curriculum across Classes 1 through 12,
                enabling millions of students to study STEM and humanities directly in their mother
                tongue.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            INTENDED AUDIENCE & USE CASES: Real Practical Value
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="usecases-heading" className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Who Anuwad Is Built For
            </span>
            <h2
              id="usecases-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              Empowering Learners, Scholars, and Readers
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Designed to solve genuine language accessibility challenges across diverse domains.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <GraduationCap className="h-4 w-4" />
                <span>K-12 &amp; Competitive Exam Aspirants</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Master Complex Curricula in Your Mother Tongue
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Students preparing for state boards, CBSE, JEE, or NEET can read science and
                mathematics textbooks with bilingual clarity. Retain scientific definitions in both
                English and regional languages without getting stumped by unfamiliar syntax.
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <Cpu className="h-4 w-4" />
                <span>Researchers &amp; Technical Professionals</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Decipher Global Papers, Patents, and Preprints
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Review foreign literature, conference papers, and patent filings while preserving
                exact mathematical notation, tables, and structural diagrams. Maintain 100%
                confidentiality for proprietary corporate analysis.
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <Headphones className="h-4 w-4" />
                <span>Auditory Learners &amp; Accessibility Needs</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Turn Dense Print Pages into Spoken Audiobooks
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Overcome reading fatigue and dyslexia. Listen to entire chapters on the go with
                natural neural voice synthesis. Follow along visually with synced line highlights
                and customizable playback speeds.
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/50 p-6 sm:p-8 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span>Privacy-Critical Legal &amp; Medical Analysts</span>
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Translate Confidential Records Without Cloud Exposure
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Attorneys, policy makers, and physicians can analyze sensitive briefs and medical
                reports with confidence that the original PDF blob remains strictly localized to
                their local browser sandbox.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            APPLICATION WORKFLOW PATHWAYS: Global Library & Local Library
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="pathways-heading" className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Direct Application Access
            </span>
            <h2
              id="pathways-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display"
            >
              Enter the Anuwad Library
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Choose your reading pathway or pick up where you left off.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* 1. Global Library */}
            <Link
              to="/global-library"
              preload="intent"
              className="group relative flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/50 p-7 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-surface-2/80 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner transition-transform duration-300 group-hover:scale-110">
                    <Globe className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
                    NCERT Classes 1–12
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                    Global Library
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Explore curated, official NCERT curriculum textbooks across Science,
                    Mathematics, History, Civics, Geography, and Economics. Read chapters instantly in
                    vernacular languages.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-1.5 text-xs font-bold text-primary">
                <span>Explore Curriculum Library</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* 2. Local Library */}
            <Link
              to="/library"
              preload="intent"
              className="group relative flex flex-col justify-between rounded-3xl border border-border/80 bg-surface/50 p-7 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-surface-2/80 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner transition-transform duration-300 group-hover:scale-110">
                    <FolderOpen className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-surface-2 border border-border px-3 py-1 text-xs font-bold text-muted-foreground">
                    Private Bookshelf
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                    Local Library
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Access your uploaded personal PDFs, books, and research papers. Track reading
                    progress, bookmarks, and translated segments securely cached in your browser.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-1.5 text-xs font-bold text-primary">
                <span>Open My Bookshelf</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            FREQUENTLY ASKED QUESTIONS (FAQ) & GEO OPTIMIZATION
           ══════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="faq-heading" className="space-y-8 max-w-4xl mx-auto">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Got Questions?
            </span>
            <h2
              id="faq-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-display"
            >
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Clear answers regarding privacy, language capabilities, OCR accuracy, and offline
              reading.
            </p>
          </div>

          <div className="divide-y divide-border/60 rounded-3xl border border-border/80 bg-surface/50 overflow-hidden">
            {FAQS.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div key={index} className="transition-colors hover:bg-surface-2/40">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-5 sm:p-6 text-left font-bold text-foreground text-sm sm:text-base gap-4 cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-primary" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6 text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 animate-in fade-in duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            CALL TO ACTION BANNER: Start Reading
           ══════════════════════════════════════════════════════════════ */}
        <section
          aria-label="Call to Action"
          className="rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/10 via-surface/60 to-surface p-8 sm:p-12 text-center space-y-6 shadow-xl"
        >
          <div className="space-y-3 max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
              Begin Reading in Your Mother Tongue Today
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Upload any PDF or browse the NCERT curriculum catalog. Free, private, and powered by
              browser AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Document</span>
            </button>
            <Link
              to="/global-library"
              preload="intent"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-semibold text-foreground hover:border-primary/50 hover:bg-surface-2 transition-all active:scale-95"
            >
              <Globe className="h-4 w-4 text-primary" />
              <span>Explore NCERT Books</span>
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            COMPREHENSIVE SEMANTIC FOOTER
           ══════════════════════════════════════════════════════════════ */}
        <footer className="border-t border-border/60 pt-12 space-y-8 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand Column */}
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/light_13746323.png"
                  alt="Anuwad Logo"
                  className="h-8 w-8 object-contain rounded-lg"
                />
                <span className="text-base font-bold text-foreground font-display">Anuwad</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                A private, in-browser document reading and AI translation workspace dedicated to
                democratizing knowledge across languages and bridging the vernacular education gap.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Open Source under GNU General Public License v3.0</span>
              </div>
            </div>

            {/* Navigation Column */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Workspace
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/global-library" className="hover:text-primary transition-colors">
                    NCERT Global Library
                  </Link>
                </li>
                <li>
                  <Link to="/library" className="hover:text-primary transition-colors">
                    My Documents Bookshelf
                  </Link>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-primary transition-colors">
                    General Settings
                  </Link>
                </li>
                <li>
                  <Link
                    to="/settings/appearance"
                    className="hover:text-primary transition-colors"
                  >
                    Theme &amp; Appearance
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal & Mission Column */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Trust &amp; Legal
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/privacy" className="hover:text-primary transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-primary transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/support" className="hover:text-rose-400 transition-colors">
                    Support Our Mission
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
            <p>© {new Date().getFullYear()} Anuwad.com. All rights reserved.</p>
            <p>
              Built with care by{" "}
              <a
                href="https://github.com/CyberBanjara"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                CyberBanjara
              </a>
            </p>
          </div>
        </footer>
      </div>
    </SidebarLayout>
  );
}
