import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import { toast } from "sonner";
import { getAllPages, getDoc } from "@/lib/storage";
import { getStoredLanguage, getOutputLanguage } from "@/lib/openrouter";

let fontsRegistered = false;

/**
 * Registers Unicode and Indic TTF fonts with @react-pdf/renderer.
 * Fonts are served from /fonts/ in public directory.
 */
export function registerPdfFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const fontBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/fonts`
      : "./public/fonts";

  // Mukta (Devanagari - Hindi, Marathi, Sanskrit + Latin)
  Font.register({
    family: "Mukta",
    fonts: [
      { src: `${fontBase}/Mukta-Regular.ttf`, fontWeight: "normal" },
      { src: `${fontBase}/Mukta-Bold.ttf`, fontWeight: "bold" },
    ],
  });

  // Hind Siliguri (Bengali, Assamese + Latin)
  Font.register({
    family: "HindSiliguri",
    fonts: [
      { src: `${fontBase}/HindSiliguri-Regular.ttf`, fontWeight: "normal" },
      { src: `${fontBase}/HindSiliguri-Bold.ttf`, fontWeight: "bold" },
    ],
  });

  // Noto Sans (Latin / Global fallback)
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: `${fontBase}/NotoSans-Regular.ttf`, fontWeight: "normal" },
      { src: `${fontBase}/NotoSans-Bold.ttf`, fontWeight: "bold" },
    ],
  });

  // Tamil
  Font.register({
    family: "NotoSansTamil",
    src: `${fontBase}/NotoSansTamil-Regular.ttf`,
  });

  // Telugu
  Font.register({
    family: "NotoSansTelugu",
    src: `${fontBase}/NotoSansTelugu-Regular.ttf`,
  });

  // Gujarati
  Font.register({
    family: "HindVadodara",
    src: `${fontBase}/HindVadodara-Regular.ttf`,
  });

  // Kannada
  Font.register({
    family: "NotoSansKannada",
    src: `${fontBase}/NotoSansKannada-Regular.ttf`,
  });

  // Malayalam
  Font.register({
    family: "Manjari",
    src: `${fontBase}/Manjari-Regular.ttf`,
  });

  // Punjabi / Gurmukhi
  Font.register({
    family: "NotoSansGurmukhi",
    src: `${fontBase}/NotoSansGurmukhi-Regular.ttf`,
  });

  // Odia
  Font.register({
    family: "NotoSansOriya",
    src: `${fontBase}/NotoSansOriya-Regular.ttf`,
  });

  // Arabic / Urdu
  Font.register({
    family: "NotoSansArabic",
    src: `${fontBase}/NotoSansArabic-Regular.ttf`,
  });
}

/**
 * Resolves the primary font family for the target translation language.
 */
export function resolvePdfFont(language?: string): string {
  if (!language) return "Mukta";
  const l = language.toLowerCase().trim();

  // Devanagari (Hindi, Marathi, Sanskrit, Nepali, Bhojpuri, Maithili)
  if (
    l.includes("hindi") ||
    l.includes("हिंदी") ||
    l.includes("हिन्दी") ||
    l.includes("marathi") ||
    l.includes("मराठी") ||
    l.includes("sanskrit") ||
    l.includes("संस्कृत") ||
    l.includes("nepali") ||
    l.includes("नेपाली") ||
    l.includes("devanagari")
  ) {
    return "Mukta";
  }

  // Bengali & Assamese
  if (
    l.includes("bengali") ||
    l.includes("bangla") ||
    l.includes("বাংলা") ||
    l.includes("assamese") ||
    l.includes("অসমীয়া")
  ) {
    return "HindSiliguri";
  }

  // Tamil
  if (l.includes("tamil") || l.includes("தமிழ்")) {
    return "NotoSansTamil";
  }

  // Telugu
  if (l.includes("telugu") || l.includes("తెలుగు")) {
    return "NotoSansTelugu";
  }

  // Gujarati
  if (l.includes("gujarati") || l.includes("ગુજરાતી")) {
    return "HindVadodara";
  }

  // Kannada
  if (l.includes("kannada") || l.includes("ಕನ್ನಡ")) {
    return "NotoSansKannada";
  }

  // Malayalam
  if (l.includes("malayalam") || l.includes("മലയാളം")) {
    return "Manjari";
  }

  // Gurmukhi / Punjabi
  if (l.includes("punjabi") || l.includes("ਪੰਜਾਬੀ") || l.includes("gurmukhi")) {
    return "NotoSansGurmukhi";
  }

  // Odia
  if (l.includes("odia") || l.includes("oriya") || l.includes("ଓଡ଼ିଆ")) {
    return "NotoSansOriya";
  }

  // Arabic / Urdu
  if (
    l.includes("arabic") ||
    l.includes("العربية") ||
    l.includes("urdu") ||
    l.includes("اردو")
  ) {
    return "NotoSansArabic";
  }

  // English / European / Latin
  return "NotoSans";
}

interface MarkdownBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "bullet" | "numbered" | "blockquote" | "hr";
  content?: string;
  num?: string;
}

/**
 * Parses markdown text into structured semantic blocks for PDF rendering.
 */
function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split(/\r?\n/);
  let currentParagraph: string[] = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      blocks.push({ type: "paragraph", content: currentParagraph.join(" ") });
      currentParagraph = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push({ type: "h1", content: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "h2", content: line.slice(3).trim() });
    } else if (line.startsWith("### ")) {
      flushParagraph();
      blocks.push({ type: "h3", content: line.slice(4).trim() });
    } else if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      blocks.push({ type: "bullet", content: line.replace(/^[-*•]\s+/, "").trim() });
    } else if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      blocks.push({
        type: "numbered",
        num: match ? match[1] : "1",
        content: match ? match[2].trim() : line,
      });
    } else if (line.startsWith("> ")) {
      flushParagraph();
      blocks.push({ type: "blockquote", content: line.slice(2).trim() });
    } else if (line === "---" || line === "***" || line === "___") {
      flushParagraph();
      blocks.push({ type: "hr" });
    } else {
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

/**
 * Renders bold markdown inline formatting (**bold**) inside text.
 */
function renderInlineText(
  content: string,
  boldStyle?: any,
) {
  if (!content.includes("**")) {
    return content;
  }
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={idx} style={boldStyle}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}

const createPdfStyles = (fontFamily: string) =>
  StyleSheet.create({
    page: {
      paddingTop: 54,
      paddingBottom: 48,
      paddingHorizontal: 44,
      fontFamily,
      fontSize: 10.5,
      lineHeight: 1.6,
      color: "#1E293B",
      position: "relative",
    },
    // Elegant background watermark on every page
    watermarkContainer: {
      position: "absolute",
      top: 250,
      left: 100,
      right: 100,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.055,
    },
    watermarkLogo: {
      width: 140,
      height: 140,
      marginBottom: 8,
    },
    watermarkText: {
      fontSize: 36,
      fontWeight: "bold",
      color: "#000000",
      letterSpacing: 2,
    },
    // Running header on every page
    header: {
      position: "absolute",
      top: 20,
      left: 44,
      right: 44,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 0.75,
      borderBottomColor: "#E2E8F0",
      paddingBottom: 6,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    headerLogo: {
      width: 16,
      height: 16,
    },
    headerBrand: {
      fontSize: 9.5,
      fontWeight: "bold",
      color: "#0F766E",
      letterSpacing: 0.5,
    },
    headerRight: {
      fontSize: 8,
      color: "#64748B",
    },
    // Running footer on every page
    footer: {
      position: "absolute",
      bottom: 18,
      left: 44,
      right: 44,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 0.75,
      borderTopColor: "#E2E8F0",
      paddingTop: 5,
    },
    footerLeft: {
      fontSize: 7.5,
      color: "#94A3B8",
    },
    pageNumber: {
      fontSize: 7.5,
      color: "#94A3B8",
    },
    // Content element styles
    pageSection: {
      marginBottom: 16,
    },
    pageDivider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 14,
      gap: 8,
    },
    pageDividerLine: {
      flex: 1,
      height: 0.5,
      backgroundColor: "#CBD5E1",
    },
    pageDividerText: {
      fontSize: 8,
      fontWeight: "bold",
      color: "#64748B",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    h1: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#0F172A",
      marginTop: 10,
      marginBottom: 6,
    },
    h2: {
      fontSize: 13,
      fontWeight: "bold",
      color: "#1E293B",
      marginTop: 8,
      marginBottom: 5,
    },
    h3: {
      fontSize: 11,
      fontWeight: "bold",
      color: "#334155",
      marginTop: 6,
      marginBottom: 4,
    },
    paragraph: {
      fontSize: 10.5,
      color: "#334155",
      marginBottom: 8,
      textAlign: "justify",
    },
    bold: {
      fontWeight: "bold",
    },
    bulletRow: {
      flexDirection: "row",
      marginBottom: 4,
      paddingLeft: 8,
    },
    bulletSign: {
      width: 14,
      fontWeight: "bold",
      color: "#0F766E",
    },
    bulletContent: {
      flex: 1,
      fontSize: 10.5,
      color: "#334155",
    },
    blockquote: {
      borderLeftWidth: 2.5,
      borderLeftColor: "#0D9488",
      paddingLeft: 8,
      marginVertical: 6,
      color: "#475569",
      fontStyle: "italic",
    },
    hr: {
      borderBottomWidth: 0.75,
      borderBottomColor: "#E2E8F0",
      marginVertical: 10,
    },
  });

interface PageContentItem {
  pageNumber: number;
  blocks: MarkdownBlock[];
}

interface TranslatedPdfDocumentProps {
  documentTitle: string;
  language: string;
  fontFamily: string;
  logoUrl: string;
  pages: PageContentItem[];
}

export function TranslatedPdfDocument({
  documentTitle,
  language,
  fontFamily,
  logoUrl,
  pages,
}: TranslatedPdfDocumentProps) {
  const styles = createPdfStyles(fontFamily);

  return (
    <Document title={`${documentTitle} — Translated by Anuwad`} author="Anuwad">
      <Page size="A4" style={styles.page}>
        {/* Repeating Watermark */}
        <View style={styles.watermarkContainer} fixed>
          <Image src={logoUrl} style={styles.watermarkLogo} />
          <Text style={styles.watermarkText}>Anuwad</Text>
        </View>

        {/* Repeating Running Header */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Image src={logoUrl} style={styles.headerLogo} />
            <Text style={styles.headerBrand}>Anuwad</Text>
          </View>
          <Text style={styles.headerRight}>
            {documentTitle} {language ? `• ${language}` : ""}
          </Text>
        </View>

        {/* Document Content Flow */}
        <View>
          {pages.map((p, pageIdx) => (
            <View key={`doc-p-${p.pageNumber}`} style={styles.pageSection}>
              {pages.length > 1 && (
                <View style={styles.pageDivider}>
                  <View style={styles.pageDividerLine} />
                  <Text style={styles.pageDividerText}>Page {p.pageNumber}</Text>
                  <View style={styles.pageDividerLine} />
                </View>
              )}

              {p.blocks.map((b, blockIdx) => {
                const key = `${pageIdx}-${blockIdx}`;
                if (b.type === "h1") {
                  return (
                    <Text key={key} style={styles.h1}>
                      {renderInlineText(b.content || "", styles.bold)}
                    </Text>
                  );
                }
                if (b.type === "h2") {
                  return (
                    <Text key={key} style={styles.h2}>
                      {renderInlineText(b.content || "", styles.bold)}
                    </Text>
                  );
                }
                if (b.type === "h3") {
                  return (
                    <Text key={key} style={styles.h3}>
                      {renderInlineText(b.content || "", styles.bold)}
                    </Text>
                  );
                }
                if (b.type === "paragraph") {
                  return (
                    <Text key={key} style={styles.paragraph}>
                      {renderInlineText(b.content || "", styles.bold)}
                    </Text>
                  );
                }
                if (b.type === "bullet") {
                  return (
                    <View key={key} style={styles.bulletRow}>
                      <Text style={styles.bulletSign}>•</Text>
                      <Text style={styles.bulletContent}>
                        {renderInlineText(b.content || "", styles.bold)}
                      </Text>
                    </View>
                  );
                }
                if (b.type === "numbered") {
                  return (
                    <View key={key} style={styles.bulletRow}>
                      <Text style={styles.bulletSign}>{b.num}.</Text>
                      <Text style={styles.bulletContent}>
                        {renderInlineText(b.content || "", styles.bold)}
                      </Text>
                    </View>
                  );
                }
                if (b.type === "blockquote") {
                  return (
                    <View key={key} style={styles.blockquote}>
                      <Text style={styles.paragraph}>
                        {renderInlineText(b.content || "", styles.bold)}
                      </Text>
                    </View>
                  );
                }
                if (b.type === "hr") {
                  return <View key={key} style={styles.hr} />;
                }
                return null;
              })}
            </View>
          ))}
        </View>

        {/* Repeating Running Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            Translated with Anuwad • Private & Offline Document AI
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Generates and downloads a professionally formatted PDF containing
 * the active translated text using @react-pdf/renderer.
 */
export async function exportAsPdf(docId: string): Promise<void> {
  const doc = await getDoc(docId);
  const pages = await getAllPages(docId);
  const activeLanguage = getStoredLanguage() || getOutputLanguage() || "Translated";

  const translatedPages: PageContentItem[] = [];

  for (const page of pages) {
    const rawText = page.pageAi?.status === "done" ? page.pageAi.result?.trim() : "";
    if (rawText) {
      translatedPages.push({
        pageNumber: page.pageNumber,
        blocks: parseMarkdownBlocks(rawText),
      });
    }
  }

  if (translatedPages.length === 0) {
    toast.error("No translated content found to export. Please translate pages first.");
    return;
  }

  // Register Unicode / Indic fonts
  registerPdfFonts();

  const fontFamily = resolvePdfFont(activeLanguage);
  const docTitle = doc?.fileName?.replace(/\.[^/.]+$/, "") || "Anuwad-Document";
  const logoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/light_13746323.png`
      : "./public/light_13746323.png";

  const docElement = (
    <TranslatedPdfDocument
      documentTitle={docTitle}
      language={activeLanguage}
      fontFamily={fontFamily}
      logoUrl={logoUrl}
      pages={translatedPages}
    />
  );

  const blob = await pdf(docElement).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${docTitle}-${activeLanguage ? activeLanguage.toLowerCase().replace(/\s+/g, "_") : "translated"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release temporary object URL to prevent memory leaks
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);

  toast.success("Exported as PDF.");
}
