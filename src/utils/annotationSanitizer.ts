/**
 * Annotation Sanitizer & Universal Prompt Rule Normalizer (V2.4)
 *
 * Aligns with Slot 1 Universal Prompt rules:
 * - Rule 1.4: Standard English uppercase acronyms (2nd ARC, GDP, PIL, CEA, NTPC, RBI, CAG, etc.)
 *   are preserved in uppercase English. Redundant Hindi+bracketed acronym repetitions like
 *   "केंद्रीय विद्युत प्राधिकरण (CEA)" or Devanagari transliterations like "एनटीपीसी" are normalized to "CEA", "NTPC".
 * - Rule 1.11, 3.3, 4.E, 6.4: Preserves (सही), (आंशिक), (गलत), (अप्रासंगिक) tags in report fields.
 * - Rule 7.5 & 7.8: Margin comments have no heading/tag/emoji/numbering, and no hyphens (-) between words.
 */

export const UPSC_TERMS_DICTIONARY: Array<{ pattern: RegExp; replacement: string }> = [
  // 1. Standard English Uppercase Acronyms per Rule 1.4 (Normalize Devanagari transliterations & redundant expansions)
  { pattern: /केंद्रीय\s+विद्युत\s+प्राधिकरण\s*\(\s*CEA\s*\)/gi, replacement: 'CEA' },
  { pattern: /राष्ट्रीय\s+ताप\s+विद्युत\s+निगम\s*\(\s*NTPC\s*\)/gi, replacement: 'NTPC' },
  { pattern: /सकल\s+घरेलू\s+उत्पाद\s*\(\s*GDP\s*\)/gi, replacement: 'GDP' },
  { pattern: /जनहित\s+याचिका\s*\(\s*PIL\s*\)/gi, replacement: 'PIL' },
  { pattern: /द्वितीय\s+प्रशासनिक\s+सुधार\s+आयोग\s*\(\s*2nd\s*ARC\s*\)/gi, replacement: '2nd ARC' },
  { pattern: /भारतीय\s+रिज़र्व\s+बैंक\s*\(\s*RBI\s*\)|भारतीय\s+रिजर्व\s+बैंक\s*\(\s*RBI\s*\)/gi, replacement: 'RBI' },
  { pattern: /नियंत्रक\s+एवं\s+महालेखा\s+परीक्षक\s*\(\s*CAG\s*\)/gi, replacement: 'CAG' },
  { pattern: /राष्ट्रीय\s+खाद्य\s+सुरक्षा\s+अधिनियम\s*\(\s*NFSA\s*\)/gi, replacement: 'NFSA' },
  { pattern: /सार्वजनिक\s+वितरण\s+प्रणाली\s*\(\s*PDS\s*\)/gi, replacement: 'PDS' },
  { pattern: /लक्षित\s+सार्वजनिक\s+वितरण\s+प्रणाली\s*\(\s*TPDS\s*\)/gi, replacement: 'TPDS' },
  { pattern: /न्यूनतम\s+समर्थन\s+मूल्य\s*\(\s*MSP\s*\)/gi, replacement: 'MSP' },
  { pattern: /भारतीय\s+खाद्य\s+निगम\s*\(\s*FCI\s*\)/gi, replacement: 'FCI' },
  { pattern: /राष्ट्रीय\s+पारिवारिक\s+स्वास्थ्य\s+सर्वेक्षण\s*\(\s*NFHS(?:-\d+)?\s*\)/gi, replacement: 'NFHS' },
  { pattern: /सूचना\s+का\s+अधिकार\s*\(\s*RTI\s*\)/gi, replacement: 'RTI' },
  { pattern: /एनटीपीसी/g, replacement: 'NTPC' },
  { pattern: /सीईए/g, replacement: 'CEA' },
  { pattern: /जीडीपी/g, replacement: 'GDP' },
  { pattern: /पीआईएल/g, replacement: 'PIL' },
  { pattern: /एनडीआरएफ/g, replacement: 'NDRF' },
  { pattern: /एनडीएमए/g, replacement: 'NDMA' },
  { pattern: /आरबीआई/g, replacement: 'RBI' },
  { pattern: /सीएजी/g, replacement: 'CAG' },
  { pattern: /एमएसपी/g, replacement: 'MSP' },
  { pattern: /पीडीएस/g, replacement: 'PDS' },
  { pattern: /एफसीआई/g, replacement: 'FCI' },
  { pattern: /एनएफएचएस/g, replacement: 'NFHS' },
  { pattern: /सीपीग्राम्स/g, replacement: 'CPGRAMS' },

  // 2. General English prose words to administrative Hindi (non-acronyms)
  { pattern: /\bWay Forward\b/gi, replacement: 'आगे की राह' },
  { pattern: /\bIntroduction\b/gi, replacement: 'भूमिका' },
  { pattern: /\bConclusion\b/gi, replacement: 'निष्कर्ष' },
  { pattern: /\bDiagram\b/gi, replacement: 'आरेख' },
  { pattern: /\bFlowchart\b/gi, replacement: 'फ्लोचार्ट' },
  { pattern: /\bValue Addition\b/gi, replacement: 'मूल्य संवर्धन' },
  { pattern: /\bIrrelevant\b/gi, replacement: 'अप्रासंगिक' },
  { pattern: /\bSub-heading\b/gi, replacement: 'उप-शीर्षक' },
  { pattern: /\bBasic Structure\b/gi, replacement: 'मूल ढांचा' },
  { pattern: /\bJudicial Review\b/gi, replacement: 'न्यायिक समीक्षा' },
  { pattern: /\bSeparation of Powers\b/gi, replacement: 'शक्तियों का पृथक्करण' },
  { pattern: /\bRule of Law\b/gi, replacement: 'विधि का शासन' },
  { pattern: /\bFiscal Deficit\b/gi, replacement: 'राजकोषीय घाटा' },
  { pattern: /\bInflation\b/gi, replacement: 'मुद्रास्फीति' },
  { pattern: /\bInclusive Growth\b/gi, replacement: 'समावेशी विकास' },
  { pattern: /\bSustainable Development\b/gi, replacement: 'सतत विकास' },
  { pattern: /\bCase Studies?\b/gi, replacement: 'केस स्टडी' }
];

/**
 * Normalizes common spelling glitches and removes duplicate bracketed repetitions
 * per Rule 1.4 ("हिंदी नाम के बाद कोष्ठक में वही नाम न दोहराएँ").
 */
export function normalizeFixedGlossaryTerms(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input
    .replace(/द्वितीयाक|द्वितीया(?=\s+प्रशासनिक)/g, 'द्वितीय')
    .replace(/प्रशासनिक\s+सुधार\s+आयोग\s+आयोग/g, 'प्रशासनिक सुधार आयोग')
    .replace(/आयोग\s+आयोग/g, 'आयोग')
    .replace(/सेबवोत्तम|सेवोतम/g, 'सेवोत्तम')
    // Rule 1.4: Do not repeat English name in brackets after Hindi name
    .replace(/सेवोत्तम\s+मॉडल\s*\(\s*Sevottam(?:\s+Model)?\s*\)/gi, 'सेवोत्तम मॉडल')
    .replace(/धारा\s*4\s*क(?![0-9a-zA-Z(])/g, 'धारा 4(1)(b)');
}

/**
 * Sanitizes and normalizes evaluation text.
 * - Preserves standard uppercase English acronyms (2nd ARC, GDP, PIL, CEA, NTPC, etc.) per Rule 1.4
 * - Strips redundant bracketed repetitions after Hindi phrases
 * - Preserves (सही), (आंशिक), (गलत), (अप्रासंगिक) tags in report texts
 * - When isMarginComment=true, removes word-joining hyphens (-) per Rule 7.8 and strips any leading tags per Rule 7.5
 */
export function sanitizeAnnotationText(
  rawText: string,
  languageMode: 'pure_hindi' | 'bilingual' | 'english' = 'pure_hindi',
  isMarginComment: boolean = false
): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let text = normalizeFixedGlossaryTerms(rawText.trim());

  if (languageMode === 'english') {
    return text.replace(/['"“‘]\s{0,3}['"”’]/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  // 1. Apply dictionary normalizations (acronyms + prose terms)
  for (const { pattern, replacement } of UPSC_TERMS_DICTIONARY) {
    text = text.replace(pattern, replacement);
  }

  text = normalizeFixedGlossaryTerms(text);

  // 2. Rule 1.4: If a Hindi phrase is immediately followed by an uppercase acronym in parentheses,
  // e.g. "केंद्रीय विद्युत प्राधिकरण (CEA)", keep the acronym or strip the redundant bracket repetition.
  // First, strip exact duplicate word in parens: "उपलब्धता (उपलब्धता)" -> "उपलब्धता"
  text = text.replace(/([^\s()]+)\s*\(\1\)/g, '$1');

  // Strip mixed-case English translation in parens (e.g. "उपलब्धता (Availability)" -> "उपलब्धता"),
  // while leaving uppercase acronyms if standalone or replacing "Hindi Name (ACRONYM)" -> "ACRONYM" when appropriate
  text = text.replace(/\s*\([A-Z][a-z]+(?:\s+[A-Za-z]+)*\)/g, '');
  text = text.replace(/\(\s*\)/g, '');

  // 3. Clean up isolated empty quotes
  text = text.replace(/['"“‘]\s{0,3}['"”’]/g, '');

  // 4. Strip leading bullet, emoji tags (🔴, 🟡, ➕, ✔), and numeric prefixes (①, ②, 1., etc.)
  text = text.replace(/^\s*(?:[•▪▸►\-*🔴🟡🟢➕✔✓✗✘✕×⚠️✨🌟💡📌🚩]+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|\(\d+\)|\[\d+\]|\d+[.):\-])\s*/g, '');
  text = text.replace(/^\s*(?:[•▪▸►\-*🔴🟡🟢➕✔✓✗✘✕×⚠️✨🌟💡📌🚩]+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|\(\d+\)|\[\d+\]|\d+[.):\-])\s*/g, '');

  // 5. Rule 1.10: Soften forbidden harsh words ("गंभीर त्रुटि/अस्वीकार्य") and strip word-count / blank-page guesswork
  text = text
    .replace(/गंभीर\s+तथ्यात्मक\s+त्रुटि/g, 'तथ्य गलत')
    .replace(/गंभीर\s+त्रुटि/g, 'त्रुटि')
    .replace(/पूर्णतः\s+अस्वीकार्य\s+है|अस्वीकार्य\s+है/g, 'सुधार योग्य है')
    .replace(/(?:लगभग\s*)?~?\s*\d+\s*शब्द(?:ों)?(?:\s*में)?\s*,?\s*/g, '')
    .replace(/आधा\s+पृष्ठ\s+खाली(?:\s+है)?\s*[,।]?\s*/g, '');

  // 6. Strip legacy evaluator label prefixes ("तथ्यात्मक त्रुटि:", "अधूरा तर्क:", etc.)
  const allKnownTagsPattern =
    /^(?:[🔴🟡🟢➕✔✓✗✘⚠️①②③④⑤⑥⑦⑧⑨⑩\d.)\s]*)(?:तथ्यात्मक\s*त्रुटि|अधूरा\s*तर्क\s*(?:\/\s*स्पष्टता)?|मूल्य\s*संवर्धन\s*(?:सुझाव)?|सटीक\s*बिंदु|यहाँ\s*सुधार\s*आवश्यक|अवधारणा\s*गायब|अधूरा\s*आयाम|संरचनात्मक\s*कमी|साक्ष्य\s*की\s*कमी|सटीक\s*विश्लेषण|सबल\s*बिंदु|आरेख\s*सुधार|भूमिका\s*सुधार|संतुलित\s*निष्कर्ष|प्रस्तुतीकरण\s*सुधार|तर्क\s*विस्तार|उदाहरण\s*अपेक्षित|तथ्यात्मक\s*पुष्टि|अवधारणा\s*विस्तार|उप-शीर्षक\s*अपेक्षित|नीतिगत\s*संदर्भ|प्रभावी\s*तर्क|सटीक\s*संदर्भ|स्पष्टता\s*आवश्यक|सुधार\s*सुझाव|महत्वपूर्ण\s*बिंदु|praise|fix|error|incomplete|addition)\s*[:：\-–—]\s*/i;

  for (let pass = 0; pass < 3; pass++) {
    const next = text
      .replace(allKnownTagsPattern, '')
      .replace(/^\s*(?:[🔴🟡🟢➕✔✓✗✘⚠️①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)])\s*/, '')
      .trim();
    if (next === text) break;
    text = next;
  }

  // 7. Margin-specific rules (Rule 7.5 & Rule 7.8):
  // - No leading (सही)/(आंशिक)/(गलत)/(अप्रासंगिक) tag in margin comments
  // - No hyphens (-) between two words in margin comments (use space instead)
  if (isMarginComment) {
    text = text.replace(/^\s*\((?:सही|आंशिक|गलत|अप्रासंगिक)\)\s*[:：\-–—+]?\s*/g, '');
    text = text.replace(/\s*\((?:सही|आंशिक|गलत|अप्रासंगिक)\)\s*।?\s*$/g, '।');
    // Rule 7.8: Replace hyphens between Devanagari words with a space
    text = text.replace(/([\u0900-\u097F])\s*[-–]\s*([\u0900-\u097F])/g, '$1 $2');
  }

  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

const STAMP_SET = new Set(['✔', '❌', '◯', '➔', '→', '←', '•', '⭐']);

export function isAnnotationStamp(text?: string): boolean {
  return Boolean(text && STAMP_SET.has(text.trim()));
}

/** Extracts significant Hindi/alphanumeric content tokens for similarity checks */
export function extractSignificantTokens(text: string): string[] {
  if (!text) return [];
  const withoutTag = text.replace(/^[^:：]{2,28}[:：]\s*/, '');
  const stopWords = new Set([
    'का', 'की', 'के', 'को', 'में', 'से', 'पर', 'और', 'तथा', 'एवं', 'या', 'है', 'हैं', 'था', 'थे', 'थी',
    'होना', 'चाहिए', 'किया', 'जाना', 'सकता', 'यहाँ', 'इसमें', 'इसके', 'द्वारा', 'लिए', 'साथ', 'एक', 'जो',
    'छात्र', 'उत्तर', 'बिंदु', 'स्पष्ट', 'करें', 'जोड़ें', 'लिखें', 'उल्लेख', 'प्रयोग', 'अधिक', 'कम', 'सकते',
    'सही', 'लिखा', 'रूप', 'संदर्भ', 'कारण', 'धार्मिक', 'सामाजिक', 'आर्थिक', 'राजनीतिक'
  ]);
  return withoutTag
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

export function computeTokenOverlapRatio(a: string, b: string): number {
  const tokensA = extractSignificantTokens(a);
  const tokensB = extractSignificantTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let shared = 0;
  for (const t of tokensA) {
    if (setB.has(t)) shared++;
  }
  return shared / Math.min(tokensA.length, tokensB.length);
}

/**
 * Deduplicates near-identical margin annotations on the same page
 * while sanitizing with margin comment rules (Rule 7.5 & 7.8).
 */
export function deduplicateAndDiversifyPageAnnotations<T extends { text: string; x_percent: number; y_percent: number }>(
  annotations: T[],
  languageMode: 'pure_hindi' | 'bilingual' | 'english' = 'pure_hindi'
): T[] {
  if (!Array.isArray(annotations) || annotations.length === 0) return [];

  const cleaned = annotations
    .map((ann) => {
      if (isAnnotationStamp(ann.text)) return ann;
      return {
        ...ann,
        text: sanitizeAnnotationText(ann.text, languageMode, true)
      };
    })
    .filter((ann) => Boolean(ann.text && ann.text.trim().length > 0));

  // Deduplicate near-identical text comments on the same page (>50% significant token overlap)
  const uniqueAnns: T[] = [];
  for (const ann of cleaned) {
    if (isAnnotationStamp(ann.text)) {
      uniqueAnns.push(ann);
      continue;
    }
    const dupIdx = uniqueAnns.findIndex(
      (existing) =>
        !isAnnotationStamp(existing.text) &&
        computeTokenOverlapRatio(existing.text, ann.text) >= 0.50
    );
    if (dupIdx === -1) {
      uniqueAnns.push(ann);
    } else if (ann.text.length < uniqueAnns[dupIdx].text.length && ann.text.length >= 18) {
      uniqueAnns[dupIdx] = ann;
    }
  }

  // Rule 7.2: Maximum 5 margin annotations on a full page
  return uniqueAnns.slice(0, 5);
}

/**
 * Estimates the vertical height (in % of A4 page height) that a margin annotation will occupy,
 * based on its word count and character length.
 */
export function estimateAnnotationHeightPercent(text: string, fontScale: number = 1.0): number {
  if (!text || isAnnotationStamp(text)) return 4;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const estLines = Math.max(2, Math.ceil(words / 2.3));
  const rawHeight = (estLines * 2.18 * fontScale) + 2.6;
  return Math.max(12.0, Math.min(23, rawHeight));
}

/**
 * Dynamic Height-Aware Margin Placement & Anti-Overlap Engine.
 * Enforces Rule 7.10: Left margin x_percent 0.5-4.0, y_percent 23-86; Right margin x_percent 87.5-88.5, y_percent 26-86;
 * Minimum 16 y_percent gap between two comments on the same margin when possible.
 */
export function computeDynamicAnnotationPlacement<
  T extends {
    text: string;
    x_percent: number;
    y_percent: number;
    is_custom_positioned?: boolean;
    font_scale?: number;
  }
>(
  annotations: T[],
  options?: { maxBottomPercent?: number; defaultFontScale?: number }
): Array<T & { _adjustedY: number; isLeft: boolean; isStamp: boolean }> {
  const maxBottom = options?.maxBottomPercent ?? 86.0;
  const defaultScale = options?.defaultFontScale ?? 1.0;

  const sorted = [...annotations].sort((a, b) => a.y_percent - b.y_percent);

  interface PlacedEntry {
    idx: number;
    y: number;
    height: number;
    minTop: number;
    pinned: boolean;
  }

  const leftPlaced: PlacedEntry[] = [];
  const rightPlaced: PlacedEntry[] = [];

  const results: Array<T & { _adjustedY: number; isLeft: boolean; isStamp: boolean }> = sorted.map((ann) => ({
    ...ann,
    _adjustedY: ann.y_percent,
    isLeft: ann.x_percent < 50,
    isStamp: isAnnotationStamp(ann.text)
  }));

  const canFitOnSide = (placed: PlacedEntry[], desiredY: number, height: number, minTop: number): { fitsWithoutOverflow: boolean; nextY: number } => {
    let y = Math.max(minTop, desiredY);
    if (placed.length > 0) {
      const last = placed[placed.length - 1];
      const requiredTop = last.y + Math.max(16, last.height);
      if (y < requiredTop) y = requiredTop;
    }
    return {
      fitsWithoutOverflow: y + height * 0.72 <= maxBottom,
      nextY: y
    };
  };

  sorted.forEach((ann, idx) => {
    const isStamp = isAnnotationStamp(ann.text);
    let isLeft = ann.x_percent < 50;

    if (isStamp) {
      results[idx]._adjustedY = Math.max(4, Math.min(94, ann.y_percent));
      return;
    }

    if (ann.is_custom_positioned) {
      const pinnedY = Math.max(1.5, Math.min(94, ann.y_percent));
      const h = estimateAnnotationHeightPercent(ann.text, ann.font_scale || defaultScale);
      const targetList = isLeft ? leftPlaced : rightPlaced;
      targetList.push({ idx, y: pinnedY, height: h, minTop: isLeft ? 23 : 26, pinned: true });
      results[idx]._adjustedY = pinnedY;
      return;
    }

    const scale = ann.font_scale || defaultScale;
    const height = estimateAnnotationHeightPercent(ann.text, scale);
    const primaryList = isLeft ? leftPlaced : rightPlaced;
    const oppositeList = isLeft ? rightPlaced : leftPlaced;
    const primaryMinTop = isLeft ? 23 : 26;
    const oppositeMinTop = isLeft ? 26 : 23;

    const primaryCheck = canFitOnSide(primaryList, ann.y_percent, height, primaryMinTop);

    // Balance left and right margins if primary side overflows or has 3+ items while opposite has <= 1
    if (!primaryCheck.fitsWithoutOverflow || (primaryList.length >= 3 && oppositeList.length <= 1)) {
      const oppositeCheck = canFitOnSide(oppositeList, ann.y_percent, height, oppositeMinTop);
      if (oppositeCheck.fitsWithoutOverflow && oppositeCheck.nextY < primaryCheck.nextY - 4) {
        isLeft = !isLeft;
        results[idx].isLeft = isLeft;
        results[idx].x_percent = isLeft ? 0.5 : 88;
        oppositeList.push({ idx, y: oppositeCheck.nextY, height, minTop: oppositeMinTop, pinned: false });
        results[idx]._adjustedY = oppositeCheck.nextY;
        return;
      }
    }

    primaryList.push({ idx, y: primaryCheck.nextY, height, minTop: primaryMinTop, pinned: false });
    results[idx]._adjustedY = primaryCheck.nextY;
  });

  const compactSideUpward = (placed: PlacedEntry[]) => {
    if (placed.length === 0) return;

    const last = placed[placed.length - 1];
    const safeMaxLastY = Math.max(last.minTop, maxBottom - Math.min(6, last.height * 0.35));
    if (!last.pinned && last.y > safeMaxLastY) {
      last.y = safeMaxLastY;
    }

    for (let i = placed.length - 2; i >= 0; i--) {
      const curr = placed[i];
      const below = placed[i + 1];
      if (curr.pinned) continue;
      const minGap = Math.max(15.5, curr.height * 0.88);
      if (curr.y + minGap > below.y) {
        curr.y = Math.max(curr.minTop, below.y - minGap);
      }
    }

    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1];
      const curr = placed[i];
      if (curr.pinned) continue;
      const minGap = Math.max(15.0, prev.height * 0.85);
      if (curr.y < prev.y + minGap) {
        curr.y = Math.min(86, prev.y + minGap);
      }
    }

    for (const item of placed) {
      results[item.idx]._adjustedY = Number(item.y.toFixed(2));
    }
  };

  compactSideUpward(leftPlaced);
  compactSideUpward(rightPlaced);

  return results;
}
