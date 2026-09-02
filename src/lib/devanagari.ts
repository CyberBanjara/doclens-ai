/**
 * Devanagari Legacy Font Decoder (Kruti Dev 010 / DevLys 010 / Remington Layout)
 *
 * Many Indian PDFs (NCERT textbooks, State Board books, Government gazettes, Law documents)
 * use legacy 8-bit typewriter fonts where Devanagari glyphs are encoded as ASCII characters
 * (e.g. `;wjksi esa jk"Vªokn dk mn;` for `यूरोप में राष्ट्रवाद का उदय`).
 *
 * This module detects legacy Hindi encodings and converts them into standard Unicode Devanagari.
 */

const KRUTI_COMMON_WORDS = new Set([
  "esa",
  "gSa",
  "gS",
  "gq,",
  "vkSj",
  "dks",
  "osQ",
  "dk",
  "dh",
  "fd",
  "Fkk",
  "Fks",
  "Fkha",
  "fd;k",
  "tk",
  "jgs",
  "jgh",
  "jgk",
  "gksrh",
  "gksrk",
  "gksrs",
  ",d",
  "bl",
  "us",
  "ij",
  "ls",
  "dksbZ",
  "buesa",
  "mlus",
  "tks",
  "mlosQ",
  "fp=k",
  "Lora=krk",
  "izfrek",
  "vè;k;",
  "vkfn",
  "fn;k",
  "fy,",
  "djsa",
  "djuk",
  "gks",
  "ugha",
  "viuk",
  "vius",
  "viuh",
  "dgrs",
  "dgk",
  "gksxk",
  "gksxh",
  "gksaxs",
  "Fkh",
  "Fks",
  "crk;k",
  "tkrk",
  "tkrh",
  "tkrs",
  "yksx",
  "yksxksa",
  "Hkh",
  "vki",
  "og",
  "os",
  ";g",
  ";s",
  "rqe",
  "ge",
  "lHkh",
  "lkFk",
  "ckn",
  "igys",
  "nwljk",
  "nwljs",
  "dksbZ",
  "dqN",
  "lc",
  "O;oLFkk",
  "lÙkk",
  "çdkj",
  "ns[ksa",
  "fn[kk,",
  "diM+ksa",
  "jk",
]);

/**
 * Detects whether a string or document segment contains Kruti Dev / DevLys legacy font text.
 */
export function isLegacyHindiText(text: string): boolean {
  if (!text || text.length < 4) return false;

  // If text already has substantial Devanagari Unicode characters, do not convert
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (devanagariCount > latinCount && devanagariCount > 15) {
    return false;
  }

  // Tokenize into words
  const words = text.toLowerCase().split(/[\s,.;:!?()[\]{}"'\\/`~@#$%^&*+=|<>_-]+/);
  let krutiMatchCount = 0;
  let totalWords = 0;

  for (const w of words) {
    if (!w) continue;
    totalWords++;
    if (KRUTI_COMMON_WORDS.has(w)) {
      krutiMatchCount++;
    }
  }

  // Structural Kruti Dev distinctive character patterns
  const krutiPatterns = [
    /;\w+/, // ; at start of word (य)
    /\w+\"Vª\w*/, // ष्ट्र
    /\w+\[k\w*/, // ख
    /\w+\?k\w*/, // घ
    /\w+\/k\w*/, // ध
    /\w+Fk\w*/, // थ
    /\w+Hk\w*/, // भ
    /\w+\'k\w*/, // श
    /\w+\.k\w*/, // ण
    /\w+k=\w*/, // त्र
    /\w+=\w*/, // त्र
    /\w+~”\w*/, // ligature
    /l\+k/, // फ़
    /osQ/, // के
    /fujaoqQ/, // निरंकु
    /Økafr/, // क्रांति
    /x\.k/, // गण
    /vè;k;/, // अध्याय
    /Lora=krk/, // स्वतंत्रता
    /izfrek/, // प्रतिमा
    /fp=k/, // चित्र
    /ew£r/, // मूर्ति
    /Lqywl/, // जुलूस
    /fLoV/, // स्वि
    /çfr/, // प्रति
  ];

  let patternMatches = 0;
  for (const p of krutiPatterns) {
    if (p.test(text)) patternMatches++;
  }

  const wordRatio = totalWords > 0 ? krutiMatchCount / totalWords : 0;

  return wordRatio >= 0.04 || (patternMatches >= 2 && krutiMatchCount >= 1) || patternMatches >= 3;
}

/**
 * Converts Kruti Dev 010 / DevLys 010 legacy text to standard Unicode Devanagari.
 */
export function convertKrutiDevToUnicode(legacyText: string): string {
  if (!legacyText) return "";

  let str = legacyText;

  // 1. Pre-process known Kruti Dev multi-character ligature artifacts
  const preReplacements: [RegExp, string][] = [
    // Ligatures and compound words
    [/l\+kzSQMfjId/g, "फ़्रेडरिक"],
    [/l\+kzsQfM\*d/g, "फ़्रेडरिक"],
    [/l\+kzsQ/g, "फ़्रे"],
    [/l\+kzSQ/g, "फ़्रै"],
    [/l\+kzQkaflIh/g, "फ़्रांसीसी"],
    [/l\+kzQ/g, "फ़्रा"],
    [/l\+k/g, "फ़"],
    [/l\+/g, "फ़्"],
    [/Q\+/g, "फ़"],
    [/d\+/g, "क़"],
    [/\[k\+/g, "ख़"],
    [/x\+/g, "ग़"],
    [/t\+/g, "ज़"],
    [/T\+/g, "ज़"],
    [/M\+/g, "ड़"],
    [/<\+/g, "ढ़"],
    [/fLoV\\~”kjySaM/g, "स्विट्ज़रलैंड"],
    [/fLoV~”kjySaM/g, "स्विट्ज़रलैंड"],
    [/fLoV/g, "स्वि"],
    [/”kjySaM/g, "ट्ज़रलैंड"],
    [/çfr~cfcr/g, "प्रतिबिंबित"],
    [/çdkj/g, "प्रकार"],
    [/çfr/g, "प्रति"],
    [/ç/g, "प्र"],
    [/Ûka\[kyk/g, "शृंखला"],
    [/Ûka\[k/g, "शृंख"],
    [/Ûk/g, "शृ"],
    [/Û/g, "शृ"],
    [/osQ/g, "के"],
    [/sQ/g, "े"],
    [/dks/g, "को"],
    [/vkikds/g, "आपको"],
    [/fM\*d/g, "ड्रिक"],
    [/fM\*/g, "ड्रि"],
    [/ew£r/g, "मूर्ति"],
    [/Lqywl/g, "जुलूस"],
    [/Frjaxs/g, "तिरंगे"],
    [/Frjaxk/g, "तिरंगा"],
    [/Frj/g, "तिर"],
    [/fujaoqQ\'k/g, "निरंकुश"],
    [/vaoqQ\'k/g, "अंकुश"],
    [/oqQ/g, "कु"],
    [/oQ/g, "क"],
    [/lÙkk/g, "सत्ता"],
    [/lÙk/g, "सत्त"],
    [/Ùk/g, "त्त"],
    [/oxks±/g, "वर्गों"],
    [/xks±/g, "र्गों"],
    [/s±/g, "र्ें"],
    [/oxks/g, "वर्गो"],
    [/oxZ/g, "वर्ग"],
    [/iq#\"k/g, "पुरुष"],
    [/iq#/g, "पुरु"],
    [/#\"k/g, "रुष"],
    [/#/g, "रु"],
    [/oanuk/g, "वंदना"],
    [/dYiukn\'kZ/g, "कल्पनादर्श"],
    [/dYiuk/g, "कल्पना"],
    [/;qVkxsfi;k/g, "यूटोपिया"],
    [/c¡Vs/g, "बँटे"],
    [/usrRo/g, "नेतृत्व"],
    [/vè;k;/g, "अध्याय"],
    [/èoLr/g, "ध्वस्त"],
    [/vo\'ks\"k/g, "अवशेष"],
    [/Lolu/g, "स्वप्न"],
    [/lafèk/g, "संधि"],
    [/vfèkdkj/g, "अधिकार"],
    [/vfèk/g, "अधि"],
    [/fèk/g, "धि"],
    [/èk/g, "ध"],
    [/è/g, "ध्"],
    [/Kkuksn;/g, "ज्ञानोदय"],
    [/e\'kky/g, "मशाल"],
    [/\?kks\"k\.kk/g, "घोषणा"],
    [/la;qDr/g, "संयुक्त"],
    [/pqosQ/g, "चुके"],
    [/pqo/g, "चुक"],
    [/yach/g, "लंबी"],
    [/L=kh/g, "स्त्री"],
    [/x\.kra=k/g, "गणतंत्र"],
    [/x\.kjkT;/g, "गणराज्य"],
    [/x\.k/g, "गण"],
    [/\"kehu/g, "ज़मीन"],
    [/µ/g, "-"],
    [/&/g, "—"],
    [/\]/g, ", "],
    [/\^/g, "“"],
    [/\\/g, ""],
  ];

  for (const [pat, rep] of preReplacements) {
    str = str.replace(pat, rep);
  }

  // Handle letter 'ए' / 'ऐ' for comma keys
  str = str.replace(/,s/g, "ऐ");
  str = str.replace(/,([a-zA-Z])/g, "ए$1");

  // Normalize tra and ksha ligatures before f-movement
  str = str.replace(/=k/g, "k=");

  // 2. f-movement: Move 'f' (choti 'i' matra) after the target consonant cluster
  const fullConsonants =
    "(?:k=|k\\{|\\?k|Fk|\\/k|Hk|\'k|\\.k|\\[k|d|x|N|p|t|V|B|M|<|\\.|r|n|u|Q|i|c|e|;|y|j|o|\"|l|g|K|J)";
  const halfConsonants = "(?:D|X|\\?|P|T|>|R|F|\\/|U|¶|I|C|H|E|Y|O|\'|\"|L|G|\\[|\\{|\\=)";

  const fClusterRegex = new RegExp(`f((?:${halfConsonants})*${fullConsonants}[zª]?)`, "g");
  str = str.replace(fClusterRegex, "$1f");

  // 3. Array mapping of Kruti Dev to Unicode
  const array_one: string[] = [
    // Reph combinations with matras
    "kZ",
    "aZ",
    "SZ",
    "sZ",
    "wZ",
    "qZ",
    "hZ",
    "fZ",
    // Special ligatures
    "ñ",
    "ò",
    "ó",
    "ô",
    "õ",
    "ö",
    "÷",
    "‘",
    "’",
    "“",
    "”",
    "µ",
    "•",
    "‰",
    "¿",
    "À",
    "Á",
    "Â",
    "Ã",
    "Ä",
    "Å",
    "Æ",
    "Ç",
    "È",
    "É",
    "Ê",
    "Ë",
    "Ì",
    "Í",
    "Î",
    "Ï",
    "Ð",
    "Ñ",
    "Ò",
    "Ó",
    "Ô",
    "Õ",
    "Ö",
    "×",
    "Ø",
    "Ù",
    "Ú",
    "Û",
    "Ü",
    "Ý",
    "Þ",
    "ß",
    "à",
    "á",
    "â",
    "ã",
    "ä",
    "å",
    "æ",
    "ç",
    "è",
    "é",
    "ê",
    "ë",
    "ì",
    "í",
    "î",
    "ï",
    "ð",
    "ø",
    "ù",
    "ú",
    "û",
    "ü",
    "ý",
    "þ",
    "ÿ",
    "¡",
    "¢",
    "£",
    "¤",
    "¥",
    "¦",
    "§",
    "¨",
    "©",
    "ª",
    "«",
    "¬",
    "®",
    "¯",
    "°",
    "±",
    "²",
    "³",
    "´",
    "¶",
    "·",
    "¸",
    "¹",
    "º",
    "»",
    "¼",
    "½",
    "¾",
    // Vowels
    "vkS",
    "vks",
    "vkW",
    "vk",
    "v",
    "bZ",
    "b",
    "m",
    "Å",
    "ऋ",
    // Nukta consonants
    "d+",
    "x+",
    "T+",
    "t+",
    "M+",
    "<+",
    "Q+",
    "z+",
    "j+",
    "I+",
    // Consonants & half consonants (order: longer sequences first!)
    "Fk",
    "?k",
    "/k",
    "Hk",
    "'k",
    ".k",
    "[k",
    "{k",
    "k=",
    "Vª",
    "Mª",
    "Bª",
    "<ª",
    '>"',
    "D",
    "d",
    "X",
    "x",
    "N",
    "?",
    "³",
    "P",
    "p",
    "T",
    "t",
    "झ",
    "´",
    "V",
    "B",
    "M",
    "<",
    ".",
    "R",
    "r",
    "F",
    "n",
    "/",
    "U",
    "u",
    "¶",
    "Q",
    "I",
    "i",
    "C",
    "c",
    "H",
    "E",
    "e",
    ";",
    "Y",
    "y",
    "j",
    "O",
    "o",
    "'",
    '"',
    "L",
    "l",
    "G",
    "g",
    "K",
    "[",
    "{",
    "=",
    "J",
    "z",
    // Matras & modifiers
    "ks",
    "kS",
    "kW",
    "k",
    "h",
    "q",
    "w",
    "`",
    "s",
    "S",
    "a",
    "A",
    "%",
    "W",
    "~",
    "!",
    ":",
    "f",
    "Z",
  ];

  const array_two: string[] = [
    // Reph combinations
    "र्ा",
    "र्ं",
    "र्ै",
    "र्े",
    "र्ू",
    "र्ु",
    "र्ी",
    "र्ि",
    // Special ligatures
    "ह्र",
    "ह्न",
    "ह्म्",
    "ह्य",
    "ह्ल",
    "ह्व",
    "ह्",
    "‘",
    "’",
    "“",
    "”",
    "-",
    "•",
    "‰",
    "?",
    "।",
    "॥",
    "ऽ",
    "ॐ",
    "द्ग",
    "द्द",
    "द्ध",
    "द्भ",
    "द्म",
    "द्य",
    "द्व",
    "क्त",
    "ह्न",
    "ह्म्",
    "ह्य",
    "ह्ल",
    "ह्व",
    "हृ",
    "ष्ट",
    "ष्ठ",
    "ङ्क",
    "ङ्ख",
    "ङ्ग",
    "ङ्घ",
    "क्र",
    "द्र",
    "प्र",
    "श्र",
    "ट्र",
    "ठ्र",
    "ड्र",
    "ढ्र",
    "्र",
    "्",
    "ा",
    "ी",
    "ु",
    "ू",
    "ृ",
    "े",
    "ै",
    "ो",
    "ौ",
    "ं",
    "ँ",
    "ः",
    "़",
    "ऽ",
    "्",
    "क्र",
    "द्र",
    "प्र",
    "श्र",
    "ट्र",
    "ठ्र",
    "ड्र",
    "ढ्र",
    "ँ",
    "दृ",
    "द्य",
    "द्व",
    "द्म",
    "द्ध",
    "ह्",
    "हृ",
    "ह्न",
    "्र",
    "्र",
    "त्त",
    "रू",
    "रु",
    "ू",
    "र्",
    "ऋ",
    "रू",
    "झ",
    "फ्",
    "श",
    "ष",
    "त्र",
    "ज्ञ",
    "अं",
    "१",
    "२",
    "३",
    // Vowels
    "औ",
    "ओ",
    "ऑ",
    "आ",
    "अ",
    "ई",
    "इ",
    "उ",
    "ऊ",
    "ऋ",
    // Nukta consonants
    "क़",
    "ग़",
    "ज़",
    "ज़",
    "ड़",
    "ढ़",
    "फ़",
    "़",
    "ऱ",
    "फ़",
    // Consonants & half consonants
    "थ",
    "घ",
    "ध",
    "भ",
    "श",
    "ण",
    "ख",
    "क्ष",
    "त्र",
    "ट्र",
    "ड्र",
    "ठ्र",
    "ढ्र",
    "झ्",
    "क्",
    "क",
    "ग्",
    "ग",
    "छ",
    "घ्",
    "ङ",
    "छ",
    "च",
    "ज्",
    "ज",
    "झ",
    "झ",
    "ट",
    "ठ",
    "ड",
    "ढ",
    "ण्",
    "थ्",
    "त",
    "थ्",
    "द",
    "ध्",
    "न्",
    "न",
    "फ्",
    "फ",
    "प्",
    "प",
    "ब्",
    "ब",
    "भ्",
    "म्",
    "म",
    "य",
    "ल्",
    "ल",
    "र",
    "व्",
    "व",
    "श्",
    "ष्",
    "स्",
    "स",
    "ग्",
    "ह",
    "ज्ञ",
    "ख्",
    "क्ष्",
    "त्र्",
    "श्र",
    "्र",
    // Matras & modifiers
    "ो",
    "ौ",
    "ॉ",
    "ा",
    "ी",
    "ु",
    "ू",
    "ृ",
    "े",
    "ै",
    "ं",
    "।",
    "ः",
    "ॅ",
    "्",
    "!",
    "ः",
    "ि",
    "र्",
  ];

  for (let idx = 0; idx < array_one.length; idx++) {
    const from = array_one[idx];
    const to = array_two[idx];
    str = str.split(from).join(to);
  }

  // 4. Handle reph 'र्' positioning
  const devConsonant = "[\\u0915-\\u0939\\u0958-\\u095F]";
  const devHalant = "\\u094D";
  const devMatras = "[\\u093E-\\u094C\\u094F\\u0955-\\u0957\\u0901-\\u0903\\u093C]*";

  const rephFixRegex = new RegExp(`((?:${devConsonant}[${devHalant}]?)+${devMatras})र्`, "g");
  str = str.replace(rephFixRegex, "र्$1");

  // 5. Normalize Unicode Devanagari combinations & cleanup
  str = str
    .replace(/ि([ंँ])/g, "$1ि")
    .replace(/्([ािीुूृेैोौ])/g, "$1")
    .replace(/ाे/g, "ो")
    .replace(/ाै/g, "ौ")
    .replace(/ोे/g, "ों")
    .replace(/ो+/g, "ो")
    .replace(/ंे/g, "ें")
    .replace(/ांे/g, "ों")
    .replace(/ा+/g, "ा")
    .replace(/ +/g, " ");

  return str;
}

/**
 * Automatically converts legacy Hindi text if detected, otherwise leaves text unchanged.
 */
export function convertLegacyHindiIfNeeded(text: string): string {
  if (!text) return "";
  if (isLegacyHindiText(text)) {
    return convertKrutiDevToUnicode(text);
  }
  return text;
}
