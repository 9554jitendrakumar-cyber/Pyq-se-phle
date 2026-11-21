import type { EvaluationResult, UploadedPage } from '../types/evaluation';
import {
  computeDynamicAnnotationPlacement,
  computeTokenOverlapRatio,
  isAnnotationStamp,
  normalizeFixedGlossaryTerms
} from './annotationSanitizer';

export type EvalTagLabel = 'सही' | 'आंशिक' | 'गलत' | 'अप्रासंगिक';
export type EvalTagTone = 'green' | 'amber' | 'red';

export interface ParsedEvalTag {
  text: string;
  tag?: EvalTagLabel;
  tone?: EvalTagTone;
}

export interface ParsedDeductionReason {
  tag?: EvalTagLabel;
  tagTone?: EvalTagTone;
  gapType?: string;
  text: string;
}

const KNOWN_GAP_TYPES = [
  'कारण-प्रभाव नहीं',
  'तथ्य गलत',
  'केवल सूची',
  'साक्ष्य नहीं',
  'विषयांतर',
  'एकपक्षीय',
  'दोहराव',
  'अधूरा',
  'अपठनीय'
];

export function getTagTone(tag?: string): EvalTagTone {
  if (tag === 'सही') return 'green';
  if (tag === 'आंशिक') return 'amber';
  return 'red';
}

/**
 * Parses a tag like (सही)/(आंशिक)/(गलत)/(अप्रासंगिक) from the end or start of a text string,
 * returns the tag + color tone, and strips the tag from the text.
 */
export function parseEvalTagFromText(rawText?: string): ParsedEvalTag {
  if (!rawText || typeof rawText !== 'string') {
    return { text: '' };
  }
  let s = rawText.trim();
  let detectedTag: EvalTagLabel | undefined;

  // Match tag at end: e.g. "... लिखा है (आंशिक)।" or "... (सही)"
  const endMatch = s.match(/[\s—–\-:,;।.]*[\(\[](सही|आंशिक|गलत|अप्रासंगिक)[\)\]][\s।.]*$/);
  if (endMatch) {
    detectedTag = endMatch[1] as EvalTagLabel;
    s = s.slice(0, endMatch.index).trim();
  } else {
    // Match tag at start: e.g. "(आंशिक) ..."
    const startMatch = s.match(/^[\(\[](सही|आंशिक|गलत|अप्रासंगिक)[\)\]][\s—–\-:,;।.]*/);
    if (startMatch) {
      detectedTag = startMatch[1] as EvalTagLabel;
      s = s.slice(startMatch[0].length).trim();
    } else {
      // Match anywhere if embedded near end
      const anyMatch = s.match(/[\(\[](सही|आंशिक|गलत|अप्रासंगिक)[\)\]]/);
      if (anyMatch) {
        detectedTag = anyMatch[1] as EvalTagLabel;
        s = (s.slice(0, anyMatch.index) + ' ' + s.slice((anyMatch.index || 0) + anyMatch[0].length))
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }

  // Ensure clean trailing punctuation
  s = s.replace(/[\s—–\-:,;]+$/, '').trim();
  if (s && !/[।.!?]$/.test(s)) {
    s += '।';
  }

  return {
    text: s,
    tag: detectedTag,
    tone: detectedTag ? getTagTone(detectedTag) : undefined
  };
}

/**
 * Parses deduction_reason which starts with a tag "(सही|आंशिक|गलत|अप्रासंगिक)"
 * and may contain a gap type (e.g. "केवल सूची", "साक्ष्य नहीं", "तथ्य गलत", etc.).
 */
export function parseDeductionReason(rawText?: string): ParsedDeductionReason {
  if (!rawText || typeof rawText !== 'string') {
    return { text: '' };
  }
  let s = stripDuplicateRubricPrefix(rawText.trim(), 'deduction');
  let tag: EvalTagLabel | undefined;

  // 1. Extract leading or trailing (सही|आंशिक|गलत|अप्रासंगिक) (including compound tags like "(अप्रासंगिक/विषयांतर)" or "(अप्रासंगिक व विषयांतर)")
  const startTagMatch = s.match(/^[\(\[](सही|आंशिक|गलत|अप्रासंगिक)(?:[^)\]]{0,25})[\)\]][\s—–\-:,;|•]*/);
  if (startTagMatch) {
    tag = startTagMatch[1] as EvalTagLabel;
    s = s.slice(startTagMatch[0].length).trim();
  } else {
    const endTagMatch = s.match(/[\s—–\-:,;।.]*[\(\[](सही|आंशिक|गलत|अप्रासंगिक)(?:[^)\]]{0,25})[\)\]][\s।.]*$/);
    if (endTagMatch) {
      tag = endTagMatch[1] as EvalTagLabel;
      s = s.slice(0, endTagMatch.index).trim();
    } else {
      const bareStartTagMatch = s.match(/^(सही|आंशिक|गलत|अप्रासंगिक)(?=\s*[:—–\-|/])/);
      if (bareStartTagMatch) {
        tag = bareStartTagMatch[1] as EvalTagLabel;
        s = s.slice(bareStartTagMatch[0].length).replace(/^[\s—–\-:,;|•/]+/, '').trim();
      }
    }
  }

  // 2. Extract gap type if present at the start of remaining text
  let gapType: string | undefined;
  for (const candidate of KNOWN_GAP_TYPES) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`^[\\(\\[\\s]*${escaped}[\\)\\]\\s]*(?:[:—–\\-|,;।/]+|\\s+(?=[अ-हA-Za-z0-9]))`, 'i');
    const m = s.match(rx);
    if (m) {
      gapType = candidate;
      s = s.slice(m[0].length).replace(/^[\s—–\-:,;|•/]+/, '').trim();
      break;
    }
  }

  // Also check if a short bracketed or hyphen-separated gap label exists at the very start
  if (!gapType) {
    const shortGapMatch = s.match(/^(?:[\(\[]([^)\]]{2,20})[\)\]]|([^:—–\-।,.]{2,18}))\s*(?:[:—–\-|])\s+/);
    if (shortGapMatch) {
      const candidateGap = (shortGapMatch[1] || shortGapMatch[2] || '').trim();
      if (
        candidateGap &&
        KNOWN_GAP_TYPES.some((k) => candidateGap.includes(k) || k.includes(candidateGap))
      ) {
        gapType = candidateGap;
        s = s.slice(shortGapMatch[0].length).trim();
      }
    }
  }

  // 3. Strip any compound secondary gap label left at the start (e.g. "व विषयांतर:", "एवं साक्ष्य नहीं:", "/ विषयांतर -")
  const escapedGapUnion = KNOWN_GAP_TYPES.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const compoundGapTailRx = new RegExp(
    `^(?:[\\s—–\\-:,;|•/+]+|(?:व|एवं|और|तथा|या)\\s+)*(?:कमी\\s*[:—–\\-]\\s*)?(?:${escapedGapUnion}|अप्रासंगिक|सतही)(?:[\\)\\]\\s]*[:—–\\-|,;।/]+|\\s*[:—–\\-|])\\s*`,
    'i'
  );
  while (compoundGapTailRx.test(s)) {
    const matched = s.match(compoundGapTailRx);
    if (!matched || matched[0].length === 0) break;
    if (!gapType) {
      const found = KNOWN_GAP_TYPES.find((k) => matched[0].includes(k));
      if (found) gapType = found;
    }
    s = s.slice(matched[0].length).replace(/^[\s—–\-:,;|•/]+/, '').trim();
  }

  // Also handle case where "व विषयांतर" is followed by space without colon right after an extracted gapType
  if (gapType) {
    const bareConjunctionGapRx = new RegExp(
      `^(?:व|एवं|और|तथा|या|/)\\s*(?:${escapedGapUnion}|अप्रासंगिक)(?:[\\)\\]\\s]*[:—–\\-|,;।/]*|\\s+)`,
      'i'
    );
    while (bareConjunctionGapRx.test(s)) {
      s = s.replace(bareConjunctionGapRx, '').replace(/^[\s—–\-:,;|•/]+/, '').trim();
    }
  }

  // Strip any duplicate tag left inside s
  s = s.replace(/^[\(\[](सही|आंशिक|गलत|अप्रासंगिक)[\)\]][\s—–\-:,;|•]*/, '').trim();

  return {
    tag,
    tagTone: tag ? getTagTone(tag) : undefined,
    gapType,
    text: s
  };
}

/**
 * Distributes a total score (in 0.25 steps) across N items proportional to weights
 * using the largest-remainder method on 0.25-mark units, respecting optional per-item max caps.
 */
export function distributeQuarterMarksLargestRemainder(
  totalScore: number,
  weights: number[],
  caps?: number[]
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalUnits = Math.max(0, Math.round(totalScore * 4));
  const capUnits = caps
    ? caps.map((c) => Math.max(0, Math.round(c * 4)))
    : weights.map(() => totalUnits);

  const cleanWeights = weights.map((w, i) => (capUnits[i] > 0 ? Math.max(0, Number(w) || 0) : 0));
  let weightSum = cleanWeights.reduce((a, b) => a + b, 0);

  // If all weights are 0 but totalUnits > 0, distribute across any non-zero cap items equally
  const effectiveWeights =
    weightSum > 0
      ? cleanWeights
      : weights.map((_, i) => (capUnits[i] > 0 ? 1 : 0));
  weightSum = effectiveWeights.reduce((a, b) => a + b, 0);

  if (weightSum <= 0 || totalUnits === 0) {
    return new Array(n).fill(0);
  }

  const exactUnits = effectiveWeights.map((w) => (totalUnits * w) / weightSum);
  const units = exactUnits.map((ex, i) => Math.min(capUnits[i], Math.floor(ex + 1e-9)));

  let currentSum = units.reduce((a, b) => a + b, 0);

  // Distribute remaining 0.25 units by largest remainder
  while (currentSum < totalUnits) {
    let bestIdx = -1;
    let bestRem = -Infinity;
    for (let i = 0; i < n; i++) {
      if (units[i] < capUnits[i]) {
        const rem = exactUnits[i] - units[i];
        if (
          rem > bestRem + 1e-9 ||
          (Math.abs(rem - bestRem) <= 1e-9 &&
            bestIdx !== -1 &&
            effectiveWeights[i] > effectiveWeights[bestIdx])
        ) {
          bestRem = rem;
          bestIdx = i;
        }
      }
    }
    if (bestIdx === -1) break;
    units[bestIdx] += 1;
    currentSum += 1;
  }

  return units.map((u) => u / 4);
}

export function formatQuarterMark(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  const q = Math.round(val * 4) / 4;
  if (Number.isInteger(q)) return String(q);
  return String(Number(q.toFixed(2)));
}

function getCoverageStatusWeight(statusText?: string): number {
  const s = String(statusText || '').trim();
  if (/छूटा|अनुपस्थित/.test(s)) return 0.0;
  if (/व्यापक|पूर्ण/.test(s)) return 0.80;
  if (/संतुलित/.test(s)) return 0.50;
  if (/आंशिक/.test(s)) return 0.38;
  if (/सतही|अपर्याप्त/.test(s)) return 0.22;
  return 0.38;
}

/**
 * Helper to extract or calculate proportional marks distribution across 4 pillars:
 * 1. भूमिका (Intro), 2. मुख्य भाग (Main Body), 3. प्रस्तुतीकरण (Presentation), 4. निष्कर्ष (Conclusion)
 */
export const getMarksDistribution = (result: EvaluationResult | null) => {
  if (!result) return null;
  const max = result.total_marks?.max_marks || 10;
  const obtained = typeof result.total_marks?.obtained === 'number' ? result.total_marks.obtained : 0;
  const rb = result.rubric_breakdown;
  const q = (n: number) => Math.round(n * 4) / 4;

  const is10M = max === 10;
  const is15M = max === 15;
  const stdIntroMax = is10M ? 1.0 : (is15M ? 2.0 : q(max * 0.10));
  const stdConclMax = is10M ? 1.0 : (is15M ? 2.0 : q(max * 0.10));
  const stdPresMax = is10M ? 1.0 : (is15M ? 1.5 : q(max * 0.10));
  const stdBodyMax = Math.max(1, q(max - stdIntroMax - stdConclMax - stdPresMax));

  const rawParts = rb?.main_body?.parts || [];
  const legacyPresPart = rawParts.find((p) => p.kind === 'presentation');
  const contentRawParts = rawParts.filter((p) => p.kind !== 'presentation');

  const introMax = rb?.introduction?.max_score ?? stdIntroMax;
  const conclMax = rb?.conclusion?.max_score ?? stdConclMax;
  const presMax = rb?.presentation?.max_score ?? legacyPresPart?.max_score ?? stdPresMax;
  const rawBodyMax = rb?.main_body?.max_score;
  const bodyMax = (rawBodyMax !== undefined && rawBodyMax <= stdBodyMax + 0.25) ? rawBodyMax : stdBodyMax;

  let introScore: number;
  let bodyScore: number;
  let conclScore: number;
  let presScore: number;

  const ratio = max > 0 ? obtained / max : 0.5;

  if (rb?.introduction?.score !== undefined && rb?.main_body?.score !== undefined && rb?.conclusion?.score !== undefined) {
    introScore = q(Math.max(0, Math.min(introMax, rb.introduction.score)));
    conclScore = q(Math.max(0, Math.min(conclMax, rb.conclusion.score)));

    if (rb?.presentation?.score !== undefined) {
      presScore = q(Math.max(0, Math.min(presMax, rb.presentation.score)));
      bodyScore = q(Math.max(0, Math.min(bodyMax, rb.main_body.score)));
    } else if (legacyPresPart && typeof legacyPresPart.score === 'number') {
      presScore = q(Math.max(0, Math.min(presMax, legacyPresPart.score)));
      const contentSum = contentRawParts.reduce((acc, p) => acc + (Number(p.score) || 0), 0);
      bodyScore = contentRawParts.length > 0
        ? q(Math.max(0, Math.min(bodyMax, contentSum)))
        : q(Math.max(0, Math.min(bodyMax, rb.main_body.score - presScore)));
    } else if (contentRawParts.length > 0 && (rawBodyMax === undefined || rawBodyMax <= stdBodyMax + 0.25)) {
      bodyScore = q(Math.max(0, Math.min(bodyMax, rb.main_body.score)));
      presScore = q(Math.max(0, Math.min(presMax, obtained - introScore - bodyScore - conclScore)));
    } else {
      presScore = q(Math.max(0, Math.min(presMax, presMax * ratio)));
      bodyScore = q(Math.max(0, Math.min(bodyMax, rb.main_body.score - presScore)));
    }
  } else {
    introScore = q(Math.min(introMax, introMax * ratio));
    conclScore = q(Math.min(conclMax, conclMax * ratio));
    presScore = q(Math.min(presMax, presMax * ratio));
    bodyScore = q(Math.max(0, Math.min(bodyMax, obtained - introScore - conclScore - presScore)));
  }

  const sumOfParts = Math.round((introScore + bodyScore + conclScore + presScore) * 100) / 100;
  const introPercent = introMax > 0 ? Math.round((introScore / introMax) * 100) : 0;
  const bodyPercent = bodyMax > 0 ? Math.round((bodyScore / bodyMax) * 100) : 0;
  const conclPercent = conclMax > 0 ? Math.round((conclScore / conclMax) * 100) : 0;
  const presPercent = presMax > 0 ? Math.round((presScore / presMax) * 100) : 0;
  const totalPercent = max > 0 ? Math.round((obtained / max) * 100) : 0;

  // Normalize coverage_status in data and compute proportional 0.25-step part marks via largest-remainder
  const normalizedPartsMeta = contentRawParts.map((p) => {
    const rawStatus = String(p.coverage_status || '').trim();
    const pRatio = (p.max_score && p.max_score > 0 && typeof p.score === 'number') ? p.score / p.max_score : 0.45;
    let statusText = 'आंशिक कवरेज';
    if (/छूटा|अनुपस्थित/.test(rawStatus)) {
      statusText = 'छूटा हुआ भाग';
    } else if (/व्यापक|पूर्ण/.test(rawStatus)) {
      statusText = 'व्यापक कवरेज';
    } else if (/संतुलित/.test(rawStatus)) {
      statusText = 'संतुलित कवरेज';
    } else if (/सतही|अपर्याप्त/.test(rawStatus)) {
      statusText = 'सतही कवरेज';
    } else if (/आंशिक/.test(rawStatus)) {
      statusText = 'आंशिक कवरेज';
    } else if (typeof p.score === 'number' && p.max_score && p.max_score > 0) {
      statusText =
        p.score === 0
          ? 'छूटा हुआ भाग'
          : pRatio >= 0.72
            ? 'व्यापक कवरेज'
            : pRatio >= 0.52
              ? 'संतुलित कवरेज'
              : pRatio >= 0.30
                ? 'आंशिक कवरेज'
                : 'सतही कवरेज';
    }
    return {
      rawPart: p,
      statusText,
      weight: getCoverageStatusWeight(statusText)
    };
  });

  const partCount = normalizedPartsMeta.length;
  const partMaxArray = partCount > 0
    ? distributeQuarterMarksLargestRemainder(bodyMax, new Array(partCount).fill(1))
    : [];
  const partScoreArray = partCount > 0
    ? distributeQuarterMarksLargestRemainder(
        bodyScore,
        normalizedPartsMeta.map((m) => m.weight),
        partMaxArray
      )
    : [];

  const unifiedParts = normalizedPartsMeta.map(({ rawPart: p, statusText }, idx) => {
    const cleanedPartName = cleanSubpartTitle(p.part_name);
    const cleanedCoverage = p.coverage_and_balance
      ? stripDuplicateRubricPrefix(p.coverage_and_balance, 'coverage')
      : p.coverage_and_balance;
    const rawDeductionStr = p.deduction_reason
      ? String(p.deduction_reason)
      : (p.feedback ? String(p.feedback) : '');
    const cleanedDeduction = rawDeductionStr
      ? stripDuplicateRubricPrefix(rawDeductionStr, 'deduction')
      : '';
    const parsedDeduction = parseDeductionReason(cleanedDeduction);

    // If deduction_reason had no explicit tag, infer tag from coverage_status only if not older freeform
    return {
      ...p,
      part_name: cleanedPartName || p.part_name,
      coverage_and_balance: cleanedCoverage,
      deduction_reason: cleanedDeduction,
      parsedDeduction,
      kind: 'question_part' as const,
      score: partScoreArray[idx] ?? 0,
      max_score: partMaxArray[idx] ?? 0,
      content_score: undefined,
      content_max: undefined,
      evidence_score: undefined,
      evidence_max: undefined,
      coverage_status: statusText
    };
  });

  const ensureTrailingStop = (text: string): string => {
    const t = text.trim();
    if (!t) return '';
    return /[।.!?]$/.test(t) ? t : `${t}।`;
  };

  const buildCombinedGapAndFix = (imp?: string, valAdd?: string, fallback?: string): string => {
    const cleanImp = stripDuplicateRubricPrefix((imp || '').trim(), 'improvements');
    const cleanVal = stripDuplicateRubricPrefix((valAdd || '').trim(), 'improvements');
    let combined = '';
    if (cleanImp && cleanVal) {
      if (cleanImp.includes(cleanVal.slice(0, 20))) {
        combined = cleanImp;
      } else {
        combined = `${ensureTrailingStop(cleanImp)} ${cleanVal}`;
      }
    } else {
      combined = cleanImp || cleanVal || (fallback || '');
    }
    return ensureTrailingStop(combined);
  };

  const rawIntroStrengths = stripDuplicateRubricPrefix(
    rb?.introduction?.strengths || rb?.introduction?.feedback || '',
    'strengths'
  );
  const parsedIntroStrengths = parseEvalTagFromText(rawIntroStrengths);

  const introGapAndFix = buildCombinedGapAndFix(
    rb?.introduction?.improvements,
    rb?.introduction?.value_addition,
    ''
  );
  const introIdeal = stripDuplicateRubricPrefix(
    rb?.introduction?.ideal_approach || '',
    'ideal'
  );

  const rawConclStrengths = stripDuplicateRubricPrefix(
    rb?.conclusion?.strengths || rb?.conclusion?.feedback || '',
    'strengths'
  );
  const parsedConclStrengths = parseEvalTagFromText(rawConclStrengths);

  const conclGapAndFix = buildCombinedGapAndFix(
    rb?.conclusion?.improvements,
    rb?.conclusion?.value_addition,
    ''
  );
  const conclIdeal = stripDuplicateRubricPrefix(
    rb?.conclusion?.ideal_approach || '',
    'ideal'
  );

  // Presentation & Visuals: format_and_flow, legibility_and_spacing, and non-empty diagram_scope
  const rawPresFormat = stripDuplicateRubricPrefix(
    rb?.presentation?.format_and_flow ||
      legacyPresPart?.coverage_and_balance ||
      rb?.main_body?.presentation_feedback ||
      legacyPresPart?.feedback ||
      '',
    'format'
  );
  const presFormatAndFlow = rawPresFormat
    .replace(/[,;]\s*(?:किंतु|परंतु|लेकिन)\s*तर्कों\s+में\s+गहराई\s+की\s+कमी\s+है[।.]?/g, '।')
    .replace(/तर्कों\s+में\s+गहराई\s+की\s+कमी(?:\s+दिखती\s+है|\s+है)?/g, 'उप-शीर्षकों का और स्पष्ट विभाजन अपेक्षित है')
    .trim();

  const rawDiagramScope = stripDuplicateRubricPrefix(
    rb?.presentation?.diagram_scope ||
      (legacyPresPart?.deduction_reason ? String(legacyPresPart.deduction_reason) : '') ||
      '',
    'diagram'
  ).trim();

  const isBoilerplateDiagram =
    !rawDiagramScope ||
    /^(?:खाली|none|null|n\/a|-|—|आवश्यकता\s+नहीं|कोई\s+आरेख\s+अपेक्षित\s+नहीं)$/i.test(rawDiagramScope) ||
    /(?:मुख्य\s+आयामों\s+को\s+दर्शाने\s+हेतु\s+एक\s+संक्षिप्त\s+फ्लोचार्ट\s+बनाया\s+जा\s+सकता\s+है|उप-विषयों\s+के\s+अंतर्संबंध\s+को\s+दर्शाने|परस्पर\s+संबंध\s+को\s+दर्शाने\s+के\s+लिए\s+एक\s+संक्षिप्त\s+फ्लोचार्ट|flowchart\s+can\s+be\s+made)/i.test(
      rawDiagramScope
    );
  const presDiagramScope = !isBoilerplateDiagram ? rawDiagramScope : '';

  const presLegibilityAndSpacing = stripDuplicateRubricPrefix(
    rb?.presentation?.legibility_and_spacing || '',
    'legibility'
  )
    .replace(/[;,]?\s*हालाँकि\s+उत्तर\s+\d+\s+पृष्ठों?\s+में\s+ही\s+समाप्त\s+हो\s+गया[^।.]*[।.]?/g, '।')
    .replace(/उत्तर\s+(?:केवल\s+)?\d+\s+पृष्ठों?\s+में\s+(?:ही\s+)?समाप्त\s+हो\s+गया[^।.]*[।.]?/g, '')
    .trim();

  const presSummaryFeedback = stripDuplicateRubricPrefix(
    rb?.presentation?.feedback || presFormatAndFlow,
    'format'
  );

  const cleanedMissingPoints = (rb?.main_body?.missing_points || [])
    .map((pt) => cleanComparisonPoint(pt, unifiedParts))
    .filter((pt) => Boolean(pt && pt.trim().length > 0));

  const cleanedMatchedPoints = (rb?.main_body?.matched_points || [])
    .map((pt) => cleanComparisonPoint(pt, unifiedParts))
    .filter((pt) => Boolean(pt && pt.trim().length > 0));

  return {
    max,
    obtained,
    totalPercent,
    sumOfParts,
    revisionKeywords: [] as string[],
    nextSteps: [] as string[],
    intro: {
      score: introScore,
      max: introMax,
      percent: introPercent,
      shareOfTotal: obtained > 0 ? Math.round((introScore / obtained) * 100) : 10,
      feedback: rb?.introduction?.feedback || introGapAndFix || parsedIntroStrengths.text,
      strengths: parsedIntroStrengths.text,
      strengthsTag: parsedIntroStrengths.tag,
      strengthsTone: parsedIntroStrengths.tone,
      improvements: introGapAndFix,
      idealApproach: introIdeal
    },
    body: {
      score: bodyScore,
      max: bodyMax,
      percent: bodyPercent,
      shareOfTotal: obtained > 0 ? Math.round((bodyScore / obtained) * 100) : 70,
      feedback: '',
      matchedPoints: cleanedMatchedPoints.slice(0, 2),
      missingPoints: cleanedMissingPoints.slice(0, 3),
      parts: unifiedParts
    },
    conclusion: {
      score: conclScore,
      max: conclMax,
      percent: conclPercent,
      shareOfTotal: obtained > 0 ? Math.round((conclScore / obtained) * 100) : 10,
      feedback: rb?.conclusion?.feedback || conclGapAndFix || parsedConclStrengths.text,
      strengths: parsedConclStrengths.text,
      strengthsTag: parsedConclStrengths.tag,
      strengthsTone: parsedConclStrengths.tone,
      improvements: conclGapAndFix,
      idealApproach: conclIdeal
    },
    presentation: {
      score: presScore,
      max: presMax,
      percent: presPercent,
      shareOfTotal: obtained > 0 ? Math.round((presScore / obtained) * 100) : 10,
      formatAndFlow: presFormatAndFlow,
      diagramScope: presDiagramScope,
      legibilityAndSpacing: presLegibilityAndSpacing,
      feedback: presSummaryFeedback,
      flowchart: null
    }
  };
};

export interface FlowchartModel {
  title: string;
  nodes: string[];
  connector: '➔' | '⇄';
}

/** Strips leading "भाग 1:", "उप-भाग 2:", "Part 1:" from subpart titles */
export const cleanSubpartTitle = (rawTitle?: string): string => {
  if (!rawTitle) return '';
  let s = rawTitle.trim();
  for (let i = 0; i < 3; i++) {
    const next = s
      .replace(/^\s*(?:उप-?\s*)?(?:भाग|खंड|part|section)\s*[\d१२३४५६७८९०]+\s*[:：\-–—.)]\s*/i, '')
      .replace(/^\s*[\d१२३४५६७८९०]+[.)]\s*/, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
};

/** Strips duplicated leading heading/icon prefixes */
export const stripDuplicateRubricPrefix = (
  rawText?: string,
  fieldType?: 'strengths' | 'improvements' | 'ideal' | 'coverage' | 'deduction' | 'format' | 'diagram' | 'legibility'
): string => {
  if (!rawText) return '';
  let s = normalizeFixedGlossaryTerms(rawText.trim());

  const patternsByType: Record<string, RegExp[]> = {
    strengths: [
      /^\s*(?:[✓✔☑✨🌟•\-*]+\s*)?(?:आपने\s*लिखा|सबल\s*पक्ष|सकारात्मक\s*पक्ष|सबल\s*बिंदु|strengths?)\s*[:：\-–—]\s*/i
    ],
    improvements: [
      /^\s*(?:[✗✘✕×⚠️•\-*]+\s*)?(?:मुख्य\s*कमी\s*(?:एवं|व|और)\s*सुधार|मुख्य\s*कमी|कमी\s*(?:एवं|व|और)\s*सुधार|सुधार\s*एवं\s*सुझाव|कमी|कमियाँ|improvements?)\s*[:：\-–—]\s*/i
    ],
    ideal: [
      /^\s*(?:[✨🌟💡•\-*]+\s*)?(?:आदर्श\s*(?:शुरुआत|भूमिका|प्रस्तावना|निष्कर्ष|उत्तर)|मॉडल\s*(?:शुरुआत|भूमिका|निष्कर्ष)|सुधार|ideal\s*(?:approach|intro|introduction|conclusion))\s*[:：\-–—]\s*/i
    ],
    coverage: [
      /^\s*(?:(?:⚖️|⚖|📐|[•\-*])+\s*)?(?:कवरेज\s*(?:एवं|व|और)\s*संतुलन|कवरेज\s*संतुलन|कवरेज|coverage\s*(?:and|&)?\s*balance)\s*[:：\-–—]\s*/i
    ],
    deduction: [
      /^\s*(?:(?:📉|🗺️|⚠️|[•\-*])+\s*)?(?:अंक\s*क्यों\s*कटे|मुख्य\s*कमी\s*(?:एवं|व|और)\s*सुधार|कटौती\s*(?:का\s*)?कारण|अंक\s*कटौती\s*कारण|deduction\s*reason)\s*[:：\-–—]\s*/i
    ],
    format: [
      /^\s*(?:(?:📐|⚖️|[•\-*])+\s*)?(?:प्रारूप\s*(?:,\s*उप-?शीर्षक\s*)?(?:एवं|व|और)\s*(?:प्रवाह|उप-?शीर्षक)|प्रारूप\s*एवं\s*प्रवाह|प्रारूप|format\s*(?:and|&)?\s*flow)\s*[:：\-–—]\s*/i
    ],
    diagram: [
      /^\s*(?:(?:🗺️|🗺|🎨|[•\-*])+\s*)?(?:आरेख\s*(?:\/\s*फ्लोचार्ट\s*)?(?:\/\s*मानचित्र\s*)?(?:सुझाव|गुंजाइश)?|फ्लोचार्ट\s*सुझाव|मानचित्र\s*सुझाव|diagram\s*scope)\s*[:：\-–—]\s*/i
    ],
    legibility: [
      /^\s*(?:(?:✍️|✍|[•\-*])+\s*)?(?:पठनीयता\s*(?:एवं|व|और)\s*(?:पन्ना\s*अनुशासन|अंतराल)|पठनीयता\s*व\s*अनुशासन|पठनीयता|legibility\s*(?:and|&)?\s*spacing)\s*[:：\-–—]\s*/i
    ]
  };

  const embeddedMarginDiagnosticRx =
    /^\s*(?:[•▪▸►✓✔✗✘✕×⚠️✨🌟💡📐🗺️✍️📉]+\s*)?(?:तथ्यात्मक\s*त्रुटि|अवधारणा\s*गायब|अधूरा\s*आयाम|संरचनात्मक\s*कमी|मूल्य\s*संवर्धन|साक्ष्य\s*की\s*कमी|सटीक\s*विश्लेषण|सबल\s*बिंदु|आरेख\s*सुधार|भूमिका\s*सुधार|संतुलित\s*निष्कर्ष|प्रस्तुतीकरण\s*सुधार|तर्क\s*विस्तार|उदाहरण\s*अपेक्षित)\s*[:：\-–—]\s*/i;

  const activePatterns = [
    ...(fieldType && patternsByType[fieldType] ? patternsByType[fieldType] : Object.values(patternsByType).flat()),
    embeddedMarginDiagnosticRx
  ];

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const rx of activePatterns) {
      const next = s.replace(rx, '').trim();
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return s;
};

/**
 * Cleans missing_points / matched_points items
 */
export const cleanComparisonPoint = (
  rawPoint: string,
  parts?: Array<{ part_name?: string }>
): string => {
  if (!rawPoint) return '';
  let s = rawPoint.trim();

  s = s.replace(/^\s*(?:🎯|➕|⚡|[✓✔✗✘✕×•\-*1234567890१२३४५६७८९०.)])+\s*/, '').trim();
  s = s
    .replace(/^(?:अगली\s*कॉपी\s*का\s*(?:एक\s*)?फोकस|प्रमुख\s*सुधार(?:\s*\d+)?)\s*[:：\-–—]?\s*/i, '')
    .trim();

  const parsePartIndex = (numStr: string): number => {
    const hindiMap: Record<string, string> = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
    const normalized = numStr.replace(/[०-९]/g, (d) => hindiMap[d] || d);
    return parseInt(normalized, 10);
  };

  const getConciseTopicTag = (partName?: string): string => {
    const cleaned = cleanSubpartTitle(partName);
    if (!cleaned) return '';
    const shortened = cleaned
      .replace(/\s*(?:की\s*भूमिका|का\s*महत्व|का\s*परीक्षण|का\s*विश्लेषण|का\s*मूल्यांकन|की\s*सीमाएं|के\s*कारण)\s*$/i, '')
      .trim();
    if (shortened.length > 0 && shortened.length <= 28) {
      return shortened;
    }
    if (cleaned.length <= 28) {
      return cleaned;
    }
    return '';
  };

  const bracketMatch = s.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    let tagInside = bracketMatch[1].trim();
    let rest = bracketMatch[2].trim();

    tagInside = tagInside
      .replace(/^(?:मुख्य\s*बिंदु|सबल\s*बिंदु|छूटा\s*(?:हुआ\s*)?(?:आयाम|तथ्य|बिंदु)(?:\s*\/\s*(?:तथ्य|आयाम))?)\s*[:：\-–—]?\s*/i, '')
      .trim();

    rest = rest
      .replace(/^(?:मुख्य\s*बिंदु|सबल\s*बिंदु|छूटा\s*(?:हुआ\s*)?(?:आयाम|तथ्य|बिंदु)(?:\s*\/\s*(?:तथ्य|आयाम))?)\s*[:：\-–—]?\s*/i, '')
      .trim();

    const genericPartMatch = tagInside.match(/^(?:उप-?\s*)?(?:भाग|खंड|part)\s*([\d१२३४५६७८९०xX]+)$/i);
    if (genericPartMatch) {
      const idxNum = parsePartIndex(genericPartMatch[1]);
      const matchedPart = !isNaN(idxNum) && idxNum >= 1 && parts && parts[idxNum - 1]
        ? parts[idxNum - 1]
        : undefined;
      const replacementTopic = getConciseTopicTag(matchedPart?.part_name);
      if (replacementTopic) {
        return `[${replacementTopic}] ${rest}`;
      }
      return rest;
    }

    return tagInside ? `[${tagInside}] ${rest}` : rest;
  }

  s = s
    .replace(/^(?:(?:उप-?\s*)?(?:भाग|खंड|part)\s*[\d१२३४५६७८९०xX]+\s*[:：\-–—]?\s*)?(?:मुख्य\s*बिंदु|सबल\s*बिंदु|छूटा\s*(?:हुआ\s*)?(?:आयाम|तथ्य|बिंदु)(?:\s*\/\s*(?:तथ्य|आयाम))?)\s*[:：\-–—]\s*/i, '')
    .trim();

  return s;
};

/** Cleans raw file names, emails, and duplicate extension suffixes into an elegant candidate name */
export const cleanCandidateName = (rawName: string): string => {
  if (!rawName) return 'अनाम अभ्यर्थी';
  let name = rawName.trim();
  name = name.replace(/\.(pdf|jpe?g|png|webp)$/i, '');
  name = name.replace(/_{2,}[a-zA-Z0-9_]+$/g, '');
  name = name.replace(/[\(_\s]*\d+[\)_\s]*$/g, '');
  name = name.replace(/([a-zA-Z0-9._%+-]+)?(@|_)(gmail|yahoo|outlook|hotmail|email|rediffmail)(\.com|_com|\.[a-z]{2,})([a-zA-Z0-9._\-]*)?/gi, '');
  name = name.replace(/[\(_\s]*\d+[\)_\s]*$/g, '');
  name = name.replace(/[_\-+]+/g, ' ');
  name = name.replace(/[\(\)\[\]\d]+$/g, '').trim();

  let words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const firstWordLower = words[0].toLowerCase();
    words = words.map((w) => {
      const wLower = w.toLowerCase();
      if (wLower !== firstWordLower && wLower.endsWith(firstWordLower) && wLower.length > firstWordLower.length) {
        return w.slice(0, w.length - firstWordLower.length);
      }
      return w;
    });
    const seen = new Set<string>();
    words = words.filter((w) => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }

  if (words.length > 0) {
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return rawName.split('@')[0].split('_')[0] || 'अभ्यर्थी';
};

/** Formats a rich WhatsApp/Telegram markdown text report matching the classic 4-pillar UPSC scorecard */
export const generateWhatsAppReportText = (
  result: EvaluationResult,
  _name?: string,
  branding?: { instituteName?: string; instituteTagline?: string } | null
): string => {
  const d = getMarksDistribution(result);
  const total = result.total_marks;
  const brandHeader = branding?.instituteName?.trim()
    ? `🏛️ *${branding.instituteName.trim()} — मुख्य परीक्षा मूल्यांकन रिपोर्ट*\n`
    : `🏛️ *संघ लोक सेवा आयोग (UPSC) मुख्य परीक्षा मूल्यांकन रिपोर्ट*\n`;
  let text = brandHeader;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏆 *कुल प्राप्तांक:* *${formatQuarterMark(total.obtained)} / ${formatQuarterMark(total.max_marks)}* (${d?.totalPercent || 0}%)\n`;
  if (result.question_analysis?.detected_subject) {
    text += `📚 *विषय:* ${result.question_analysis.detected_subject}\n`;
  }
  if (result.question_analysis?.directive_word) {
    text += `📌 *निर्देशात्मक शब्द:* ${result.question_analysis.directive_word}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (d) {
    text += `📊 *4-स्तंभीय रूब्रिक अंक विभाजन:*\n`;
    text += `1️⃣ *भूमिका (Intro):* ${formatQuarterMark(d.intro.score)} / ${formatQuarterMark(d.intro.max)} (${d.intro.percent}%)\n`;
    text += `2️⃣ *मुख्य भाग (Body):* ${formatQuarterMark(d.body.score)} / ${formatQuarterMark(d.body.max)} (${d.body.percent}%)\n`;
    text += `3️⃣ *प्रस्तुतीकरण (Presentation):* ${formatQuarterMark(d.presentation.score)} / ${formatQuarterMark(d.presentation.max)} (${d.presentation.percent}%)\n`;
    text += `4️⃣ *निष्कर्ष (Conclusion):* ${formatQuarterMark(d.conclusion.score)} / ${formatQuarterMark(d.conclusion.max)} (${d.conclusion.percent}%)\n\n`;

    // 1. भूमिका
    text += `🎯 *1. भूमिका (Introduction Audit):*\n`;
    if (d.intro.strengths) {
      const tagStr = d.intro.strengthsTag ? ` (${d.intro.strengthsTag})` : '';
      text += `  ✓ *प्रभावी पक्ष:* ${d.intro.strengths}${tagStr}\n`;
    }
    if (d.intro.improvements) text += `  ⚠️ *सुधार के क्षेत्र:* ${d.intro.improvements}\n`;
    if (d.intro.idealApproach) text += `  💡 *आदर्श दृष्टिकोण:* ${d.intro.idealApproach}\n`;
    text += `\n`;

    // 2. मुख्य भाग
    text += `📐 *2. मुख्य भाग (Main Body Audit):*\n`;
    if (result.question_analysis?.core_demand_note) {
      text += `  • *मूल माँग:* ${result.question_analysis.core_demand_note}\n`;
    }
    if (d.body.parts && d.body.parts.length > 0) {
      d.body.parts.forEach((p, idx) => {
        text += `  🔹 *भाग ${idx + 1}: ${p.part_name}* [${p.coverage_status || 'आंशिक कवरेज'}]\n`;
        const pd = p.parsedDeduction;
        const badgePrefix = [pd?.tag ? `(${pd.tag})` : '', pd?.gapType ? `[${pd.gapType}]` : ''].filter(Boolean).join(' ');
        const bodyLine = pd?.text || p.deduction_reason || p.feedback || '';
        if (badgePrefix || bodyLine) {
          text += `     📉 *मूल्यांकन एवं सुधार:* ${badgePrefix ? `${badgePrefix} ` : ''}${bodyLine}\n`;
        }
      });
    }
    if (d.body.missingPoints && d.body.missingPoints.length > 0) {
      text += `\n  🎯 *अंक बढ़ाने हेतु प्रमुख सुधार (प्राथमिकता क्रम):*\n`;
      d.body.missingPoints.slice(0, 3).forEach((mp, idx) => {
        if (idx === 0) {
          text += `    🎯 *1. अगली कॉपी का एक फोकस:* ${mp}\n`;
        } else {
          text += `    ➕ *${idx + 1}. प्रमुख सुधार:* ${mp}\n`;
        }
      });
    }
    if (d.body.matchedPoints && d.body.matchedPoints.length > 0) {
      text += `\n  ✅ *सत्यापित सबल बिंदु:*\n`;
      d.body.matchedPoints.forEach((pt) => {
        text += `    ✓ ${pt}\n`;
      });
    }
    text += `\n`;

    // 3. प्रस्तुतीकरण
    text += `📊 *3. प्रस्तुतीकरण एवं संरचना (Presentation):*\n`;
    if (d.presentation.formatAndFlow) text += `  📐 *प्रारूप एवं प्रवाह:* ${d.presentation.formatAndFlow}\n`;
    if (d.presentation.legibilityAndSpacing) text += `  ✍️ *पठनीयता एवं अनुशासन:* ${d.presentation.legibilityAndSpacing}\n`;
    if (d.presentation.diagramScope) text += `  🗺️ *आरेख / मानचित्र गुंजाइश:* ${d.presentation.diagramScope}\n`;
    text += `\n`;

    // 4. निष्कर्ष
    text += `✨ *4. निष्कर्ष एवं आगे की राह (Conclusion Audit):*\n`;
    if (d.conclusion.strengths) {
      const tagStr = d.conclusion.strengthsTag ? ` (${d.conclusion.strengthsTag})` : '';
      text += `  ✓ *प्रभावी पक्ष:* ${d.conclusion.strengths}${tagStr}\n`;
    }
    if (d.conclusion.improvements) text += `  ⚠️ *सुधार के क्षेत्र:* ${d.conclusion.improvements}\n`;
    if (d.conclusion.idealApproach) text += `  💡 *आदर्श दृष्टिकोण:* ${d.conclusion.idealApproach}\n`;
  }

  return text.trim();
};

/**
 * Generates Rich Official UPSC Scorecard Page(s) as canvas JPEGs for PDF export.
 * - Uses प्रभावी पक्ष, सुधार के क्षेत्र, आदर्श दृष्टिकोण labels.
 * - Uses extra-large mobile-friendly fonts so text is big and effortless to read on phone screens.
 * - Comfortably fills up to 2 rich, well-balanced report pages.
 */
export const createAuditScorecardPages = async (
  result: EvaluationResult,
  _studentNameStr?: string,
  branding?: { instituteName?: string; instituteTagline?: string } | null
): Promise<string[]> => {
  const width = 1200;
  const maxPageContentHeight = 1780; // Balanced threshold so report naturally flows across 2 full, rich pages
  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; usedHeight: number }> = [];

  const marksDist = getMarksDistribution(result);
  const total = result.total_marks;
  const fontFamily = '"Mukta", "Noto Sans Devanagari", sans-serif';

  const createNewScorecardPage = (isPageOne: boolean) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = 2600; // Working buffer, cropped to actual content at end
    const context = c.getContext('2d', { alpha: false })!;

    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, width, c.height);

    let y = 30;

    if (isPageOne) {
      // Classic Official Dark-Slate & Gold Header Banner
      const headerH = 120;
      context.fillStyle = '#0f172a';
      context.fillRect(30, y, width - 60, headerH);
      context.strokeStyle = '#f59e0b';
      context.lineWidth = 2.5;
      context.strokeRect(30, y, width - 60, headerH);

      const mainHeaderTitle = branding?.instituteName?.trim()
        ? `${branding.instituteName.trim()} — मुख्य परीक्षा मूल्यांकन रिपोर्ट`
        : 'संघ लोक सेवा आयोग (UPSC) मुख्य परीक्षा मूल्यांकन रिपोर्ट';
      const subHeaderTitle = branding?.instituteTagline?.trim()
        ? branding.instituteTagline.trim()
        : 'OFFICIAL EVALUATION & 4-PILLAR RUBRIC SCORECARD • आधिकारिक मूल्यांकन एवं रूब्रिक स्कोरकार्ड';

      context.textAlign = 'center';
      context.fillStyle = '#fbbf24';
      context.font = `bold 34px ${fontFamily}`;
      context.fillText(mainHeaderTitle, width / 2, y + 52, width - 90);

      context.fillStyle = '#cbd5e1';
      context.font = `bold 21px ${fontFamily}`;
      context.fillText(subHeaderTitle, width / 2, y + 92, width - 90);

      y += headerH + 18;

      // Subject & Question Context Bar (if present in model output)
      const detectedSubject = result.question_analysis?.detected_subject?.trim();
      const detectedQuestion = result.question_analysis?.question_detected?.trim();
      if (detectedSubject || detectedQuestion) {
        const qBoxX = 30;
        const qBoxW = width - 60;
        context.font = `600 25px ${fontFamily}`;
        const qWords = (detectedQuestion || '').split(/\s+/).filter(Boolean);
        const qLines: string[] = [];
        let curLine = '';
        for (const w of qWords) {
          const test = curLine ? `${curLine} ${w}` : w;
          if (context.measureText(test).width > qBoxW - 48 && curLine) {
            qLines.push(curLine);
            curLine = w;
          } else {
            curLine = test;
          }
        }
        if (curLine) qLines.push(curLine);
        const displayQLines = qLines.slice(0, 4);
        const subjH = detectedSubject ? 42 : 0;
        const qTextH = displayQLines.length > 0 ? displayQLines.length * 36 + 14 : 0;
        const totalQBoxH = subjH + qTextH + 22;

        context.fillStyle = '#ffffff';
        context.fillRect(qBoxX, y, qBoxW, totalQBoxH);
        context.strokeStyle = '#cbd5e1';
        context.lineWidth = 1.8;
        context.strokeRect(qBoxX, y, qBoxW, totalQBoxH);

        // Left gold accent bar
        context.fillStyle = '#f59e0b';
        context.fillRect(qBoxX, y, 8, totalQBoxH);

        let qCurY = y + 34;
        context.textAlign = 'left';
        if (detectedSubject) {
          context.fillStyle = '#1e3a8a';
          context.font = `bold 25px ${fontFamily}`;
          context.fillText(`📚 विषय / पाठ्यक्रम: ${detectedSubject}`, qBoxX + 24, qCurY, qBoxW - 44);
          qCurY += 40;
        }
        if (displayQLines.length > 0) {
          context.fillStyle = '#0f172a';
          context.font = `600 25px ${fontFamily}`;
          displayQLines.forEach((ln, idx) => {
            const prefix = idx === 0 ? '❓ प्रश्न: ' : '';
            context.fillText(`${prefix}${ln}`, qBoxX + 24, qCurY + idx * 36, qBoxW - 44);
          });
        }
        y += totalQBoxH + 18;
      }

      // 5-Box Executive Score Strip (with Extra-Large Mobile-Friendly Fonts & Percentage Badges)
      const stripWidth = width - 60;
      const cardGap = 12;
      const cardWidth = Math.floor((stripWidth - cardGap * 4) / 5);
      const cardHeight = 150;

      const drawRichScoreBox = (
        bx: number,
        bg: string,
        border: string,
        topAccent: string,
        title: string,
        titleColor: string,
        scoreText: string,
        scoreColor: string,
        percentText: string,
        badgeBg: string,
        badgeCol: string,
        isTotalBox = false
      ) => {
        context.fillStyle = bg;
        context.fillRect(bx, y, cardWidth, cardHeight);
        context.strokeStyle = border;
        context.lineWidth = isTotalBox ? 2.5 : 1.8;
        context.strokeRect(bx, y, cardWidth, cardHeight);

        // Top color accent strip
        context.fillStyle = topAccent;
        context.fillRect(bx, y, cardWidth, 8);

        context.textAlign = 'center';
        context.fillStyle = titleColor;
        context.font = `bold 23px ${fontFamily}`;
        context.fillText(title, bx + cardWidth / 2, y + 40, cardWidth - 12);

        context.fillStyle = scoreColor;
        context.font = isTotalBox ? `900 42px ${fontFamily}` : `900 38px ${fontFamily}`;
        context.fillText(scoreText, bx + cardWidth / 2, y + 90, cardWidth - 12);

        // Percentage pill badge at bottom
        const pillW = Math.min(cardWidth - 22, 140);
        const pillX = bx + (cardWidth - pillW) / 2;
        const pillY = y + 106;
        context.fillStyle = badgeBg;
        context.fillRect(pillX, pillY, pillW, 32);
        context.fillStyle = badgeCol;
        context.font = `bold 21px ${fontFamily}`;
        context.fillText(percentText, bx + cardWidth / 2, pillY + 24);
      };

      const b0X = 30;
      drawRichScoreBox(
        b0X,
        '#fffbeb',
        '#f59e0b',
        '#d97706',
        '🏆 कुल प्राप्तांक',
        '#78350f',
        `${formatQuarterMark(total.obtained)} / ${formatQuarterMark(total.max_marks)}`,
        '#b45309',
        `${marksDist?.totalPercent || 0}% अंक`,
        '#fef3c7',
        '#92400e',
        true
      );

      const b1X = b0X + cardWidth + cardGap;
      drawRichScoreBox(
        b1X,
        '#eff6ff',
        '#60a5fa',
        '#2563eb',
        '🎯 1. भूमिका',
        '#1e3a8a',
        `${formatQuarterMark(marksDist?.intro.score)} / ${formatQuarterMark(marksDist?.intro.max)}`,
        '#1d4ed8',
        `${marksDist?.intro.percent || 0}%`,
        '#dbeafe',
        '#1e40af'
      );

      const b2X = b1X + cardWidth + cardGap;
      drawRichScoreBox(
        b2X,
        '#faf5ff',
        '#c084fc',
        '#9333ea',
        '📐 2. मुख्य भाग',
        '#581c87',
        `${formatQuarterMark(marksDist?.body.score)} / ${formatQuarterMark(marksDist?.body.max)}`,
        '#7e22ce',
        `${marksDist?.body.percent || 0}%`,
        '#f3e8ff',
        '#6b21a8'
      );

      const b3X = b2X + cardWidth + cardGap;
      drawRichScoreBox(
        b3X,
        '#fff7ed',
        '#fb923c',
        '#ea580c',
        '📊 3. प्रस्तुतीकरण',
        '#7c2d12',
        `${formatQuarterMark(marksDist?.presentation.score)} / ${formatQuarterMark(marksDist?.presentation.max)}`,
        '#c2410c',
        `${marksDist?.presentation.percent || 0}%`,
        '#ffedd5',
        '#9a3412'
      );

      const b4X = b3X + cardWidth + cardGap;
      drawRichScoreBox(
        b4X,
        '#ecfdf5',
        '#34d399',
        '#059669',
        '✨ 4. निष्कर्ष',
        '#064e3b',
        `${formatQuarterMark(marksDist?.conclusion.score)} / ${formatQuarterMark(marksDist?.conclusion.max)}`,
        '#047857',
        `${marksDist?.conclusion.percent || 0}%`,
        '#d1fae5',
        '#065f46'
      );

      y += cardHeight + 20;
    } else {
      // Continuation page compact header
      const contHeaderH = 60;
      context.fillStyle = '#0f172a';
      context.fillRect(30, y, width - 60, contHeaderH);
      context.strokeStyle = '#f59e0b';
      context.lineWidth = 2;
      context.strokeRect(30, y, width - 60, contHeaderH);

      context.textAlign = 'left';
      context.fillStyle = '#fbbf24';
      context.font = `bold 26px ${fontFamily}`;
      context.fillText('मूल्यांकन एवं रूब्रिक स्कोरकार्ड (जारी...)', 48, y + 39);

      context.textAlign = 'right';
      context.fillStyle = '#f8fafc';
      context.font = `bold 26px ${fontFamily}`;
      context.fillText(
        `कुल प्राप्तांक: ${formatQuarterMark(total.obtained)} / ${formatQuarterMark(total.max_marks)}`,
        width - 48,
        y + 39
      );
      y += contHeaderH + 18;
    }

    const pageObj = { canvas: c, ctx: context, usedHeight: y };
    pages.push(pageObj);
    return pageObj;
  };

  let curPage = createNewScorecardPage(true);

  const ensureSpace = (neededHeight: number) => {
    if (curPage.usedHeight + neededHeight > maxPageContentHeight) {
      curPage = createNewScorecardPage(false);
    }
  };

  const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawBadge = (
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    baselineY: number,
    tone: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'grey'
  ): number => {
    const palette =
      tone === 'green'
        ? { bg: '#dcfce7', border: '#4ade80', text: '#14532d' }
        : tone === 'amber'
          ? { bg: '#fef3c7', border: '#fbbf24', text: '#78350f' }
          : tone === 'red'
            ? { bg: '#ffe4e6', border: '#fb7185', text: '#881337' }
            : tone === 'blue'
              ? { bg: '#dbeafe', border: '#60a5fa', text: '#1e3a8a' }
              : tone === 'purple'
                ? { bg: '#f3e8ff', border: '#c084fc', text: '#581c87' }
                : { bg: '#f1f5f9', border: '#94a3b8', text: '#1e293b' };

    ctx.font = `bold 22px ${fontFamily}`;
    const textW = Math.ceil(ctx.measureText(label).width);
    const chipW = textW + 24;
    const chipH = 36;
    const chipY = baselineY - 27;

    ctx.fillStyle = palette.bg;
    ctx.fillRect(x, chipY, chipW, chipH);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, chipY, chipW, chipH);

    ctx.fillStyle = palette.text;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 12, baselineY - 1);

    return chipW;
  };

  // Helper to draw rich boxed Pillar Card (Used for 1. भूमिका and 4. निष्कर्ष)
  const drawRichPillarBoxCard = (params: {
    sectionTitle: string;
    scoreBadgeText: string;
    headerBg: string;
    headerBorder: string;
    headerTextColor: string;
    accentColor: string;
    strengthsText?: string;
    strengthsTag?: EvalTagLabel;
    strengthsTone?: EvalTagTone;
    improvementsText?: string;
    idealLabel: string;
    idealText?: string;
  }) => {
    const cardX = 30;
    const cardW = width - 60;
    const innerW = cardW - 36;
    const lineH = 40;

    const subBoxes: Array<{
      heading: string;
      text: string;
      bg: string;
      border: string;
      accent: string;
      headingColor: string;
      tag?: EvalTagLabel;
      tagTone?: EvalTagTone;
      lines: string[];
      boxH: number;
    }> = [];

    const mCtx = curPage.ctx;
    mCtx.font = `600 27px ${fontFamily}`;

    if (params.strengthsText) {
      const lines = wrapLines(mCtx, params.strengthsText, innerW - 36);
      const boxH = 46 + lines.length * lineH + 16;
      subBoxes.push({
        heading: '✓ प्रभावी पक्ष:',
        text: params.strengthsText,
        bg: '#f0fdf4',
        border: '#86efac',
        accent: '#16a34a',
        headingColor: '#14532d',
        tag: params.strengthsTag,
        tagTone: params.strengthsTone,
        lines,
        boxH
      });
    }

    if (params.improvementsText) {
      const lines = wrapLines(mCtx, params.improvementsText, innerW - 36);
      const boxH = 46 + lines.length * lineH + 16;
      subBoxes.push({
        heading: '⚠️ सुधार के क्षेत्र:',
        text: params.improvementsText,
        bg: '#fff1f2',
        border: '#fda4af',
        accent: '#e11d48',
        headingColor: '#881337',
        lines,
        boxH
      });
    }

    if (params.idealText) {
      const lines = wrapLines(mCtx, params.idealText, innerW - 36);
      const boxH = 46 + lines.length * lineH + 16;
      subBoxes.push({
        heading: params.idealLabel,
        text: params.idealText,
        bg: '#faf5ff',
        border: '#d8b4fe',
        accent: '#9333ea',
        headingColor: '#581c87',
        lines,
        boxH
      });
    }

    if (subBoxes.length === 0) return;

    const headerH = 60;
    const totalSubH = subBoxes.reduce((acc, b) => acc + b.boxH + 14, 0);
    const totalCardH = headerH + totalSubH + 18;

    ensureSpace(totalCardH + 18);
    const drawCtx = curPage.ctx;
    const y = curPage.usedHeight;

    // Outer Card
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(cardX, y, cardW, totalCardH);
    drawCtx.strokeStyle = params.headerBorder;
    drawCtx.lineWidth = 2.2;
    drawCtx.strokeRect(cardX, y, cardW, totalCardH);

    // Header Bar
    drawCtx.fillStyle = params.headerBg;
    drawCtx.fillRect(cardX + 1, y + 1, cardW - 2, headerH);
    drawCtx.fillStyle = params.accentColor;
    drawCtx.fillRect(cardX, y, 8, totalCardH);

    drawCtx.textAlign = 'left';
    drawCtx.fillStyle = params.headerTextColor;
    drawCtx.font = `bold 29px ${fontFamily}`;
    drawCtx.fillText(params.sectionTitle, cardX + 22, y + 40);

    drawCtx.textAlign = 'right';
    drawCtx.font = `900 28px ${fontFamily}`;
    drawCtx.fillText(params.scoreBadgeText, cardX + cardW - 20, y + 40);

    let subY = y + headerH + 14;
    for (const sb of subBoxes) {
      const sbX = cardX + 20;
      const sbW = cardW - 36;

      drawCtx.fillStyle = sb.bg;
      drawCtx.fillRect(sbX, subY, sbW, sb.boxH);
      drawCtx.strokeStyle = sb.border;
      drawCtx.lineWidth = 1.6;
      drawCtx.strokeRect(sbX, subY, sbW, sb.boxH);

      // Left accent strip inside sub-box
      drawCtx.fillStyle = sb.accent;
      drawCtx.fillRect(sbX, subY, 6, sb.boxH);

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = sb.headingColor;
      drawCtx.font = `bold 25px ${fontFamily}`;
      drawCtx.fillText(sb.heading, sbX + 18, subY + 34);

      if (sb.tag) {
        const headW = Math.ceil(drawCtx.measureText(sb.heading).width);
        drawBadge(drawCtx, `मूल्यांकन: ${sb.tag}`, sbX + 30 + headW, subY + 34, sb.tagTone || 'amber');
      }

      drawCtx.fillStyle = '#0f172a';
      drawCtx.font = `600 27px ${fontFamily}`;
      sb.lines.forEach((ln, lIdx) => {
        drawCtx.fillText(ln, sbX + 18, subY + 74 + lIdx * lineH);
      });

      subY += sb.boxH + 14;
    }

    curPage.usedHeight += totalCardH + 18;
  };

  // 1. भूमिका (INTRODUCTION AUDIT)
  if (marksDist) {
    drawRichPillarBoxCard({
      sectionTitle: '🎯 1. भूमिका मूल्यांकन (Introduction Audit)',
      scoreBadgeText: `${formatQuarterMark(marksDist.intro.score)} / ${formatQuarterMark(marksDist.intro.max)} (${marksDist.intro.percent}%)`,
      headerBg: '#dbeafe',
      headerBorder: '#60a5fa',
      headerTextColor: '#1e3a8a',
      accentColor: '#2563eb',
      strengthsText: marksDist.intro.strengths,
      strengthsTag: marksDist.intro.strengthsTag,
      strengthsTone: marksDist.intro.strengthsTone,
      improvementsText: marksDist.intro.improvements,
      idealLabel: '💡 आदर्श दृष्टिकोण:',
      idealText: marksDist.intro.idealApproach
    });
  }

  // 2. मुख्य भाग (MAIN BODY AUDIT)
  if (marksDist) {
    const cardX = 30;
    const cardW = width - 60;
    const headerH = 60;

    const dirWord = result.question_analysis?.directive_word?.trim();
    const demandMet = result.question_analysis?.core_demand_met !== false;
    const demandNote = result.question_analysis?.core_demand_note?.trim();

    const mCtx = curPage.ctx;
    mCtx.font = `600 26px ${fontFamily}`;
    const demandLines = demandNote ? wrapLines(mCtx, `पालन टिप्पणी: ${demandNote}`, cardW - 70) : [];
    const dirBannerH = (dirWord || demandLines.length > 0) ? 54 + demandLines.length * 38 + 16 : 0;

    ensureSpace(headerH + dirBannerH + 130);
    let drawCtx = curPage.ctx;
    let y = curPage.usedHeight;

    // Main Body Section Header Banner
    drawCtx.fillStyle = '#f3e8ff';
    drawCtx.fillRect(cardX, y, cardW, headerH);
    drawCtx.strokeStyle = '#a855f7';
    drawCtx.lineWidth = 2.2;
    drawCtx.strokeRect(cardX, y, cardW, headerH);
    drawCtx.fillStyle = '#9333ea';
    drawCtx.fillRect(cardX, y, 8, headerH);

    drawCtx.textAlign = 'left';
    drawCtx.fillStyle = '#581c87';
    drawCtx.font = `bold 29px ${fontFamily}`;
    drawCtx.fillText('📐 2. मुख्य भाग — प्रश्न की मांग एवं उप-भाग विश्लेषण', cardX + 22, y + 40);

    drawCtx.textAlign = 'right';
    drawCtx.font = `900 28px ${fontFamily}`;
    drawCtx.fillText(
      `${formatQuarterMark(marksDist.body.score)} / ${formatQuarterMark(marksDist.body.max)} (${marksDist.body.percent}%)`,
      cardX + cardW - 20,
      y + 40
    );
    curPage.usedHeight += headerH + 12;

    // Directive & Core Demand Sub-Banner Box
    if (dirBannerH > 0) {
      y = curPage.usedHeight;
      drawCtx.fillStyle = '#faf5ff';
      drawCtx.fillRect(cardX, y, cardW, dirBannerH);
      drawCtx.strokeStyle = '#d8b4fe';
      drawCtx.lineWidth = 1.8;
      drawCtx.strokeRect(cardX, y, cardW, dirBannerH);
      drawCtx.fillStyle = '#7e22ce';
      drawCtx.fillRect(cardX, y, 6, dirBannerH);

      let badgeX = cardX + 18;
      if (dirWord) {
        const w = drawBadge(drawCtx, `📌 निर्देशात्मक शब्द: ${dirWord}`, badgeX, y + 38, 'purple');
        badgeX += w + 14;
      }
      drawBadge(
        drawCtx,
        demandMet ? '✓ मूल माँग: पूर्ण' : '⚠️ मूल माँग: भटकाव',
        badgeX,
        y + 38,
        demandMet ? 'green' : 'red'
      );

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#0f172a';
      drawCtx.font = `600 26px ${fontFamily}`;
      demandLines.forEach((dl, idx) => {
        drawCtx.fillText(dl, cardX + 18, y + 80 + idx * 38);
      });

      curPage.usedHeight += dirBannerH + 14;
    }

    // Question Sub-Parts Cards (Coverage badge only on right, no part marks)
    for (let idx = 0; idx < marksDist.body.parts.length; idx++) {
      const p = marksDist.body.parts[idx];
      const pd = p.parsedDeduction;
      const reasonText = pd?.text || p.deduction_reason || p.feedback || '';
      const covStatus = p.coverage_status || 'आंशिक कवरेज';

      const statusTheme = /व्यापक|पूर्ण/.test(covStatus)
        ? { accent: '#16a34a', border: '#86efac', headBg: '#f0fdf4', badgeTone: 'green' as const }
        : /संतुलित/.test(covStatus)
          ? { accent: '#2563eb', border: '#93c5fd', headBg: '#eff6ff', badgeTone: 'blue' as const }
          : /सतही|छूटा/.test(covStatus)
            ? { accent: '#e11d48', border: '#fda4af', headBg: '#fff1f2', badgeTone: 'red' as const }
            : { accent: '#d97706', border: '#fcd34d', headBg: '#fffbeb', badgeTone: 'amber' as const };

      const pCtx = curPage.ctx;
      pCtx.font = `600 27px ${fontFamily}`;
      const reasonLines = reasonText ? wrapLines(pCtx, reasonText, cardW - 76) : [];
      const hasBadgesRow = Boolean(pd?.tag || pd?.gapType);
      const innerSubBoxH = (hasBadgesRow ? 48 : 0) + Math.max(1, reasonLines.length) * 40 + 24;
      const partCardH = 60 + innerSubBoxH + 24;

      ensureSpace(partCardH + 14);
      drawCtx = curPage.ctx;
      y = curPage.usedHeight;

      // Outer Part Card
      drawCtx.fillStyle = '#ffffff';
      drawCtx.fillRect(cardX, y, cardW, partCardH);
      drawCtx.strokeStyle = statusTheme.border;
      drawCtx.lineWidth = 2;
      drawCtx.strokeRect(cardX, y, cardW, partCardH);

      // Part Header Bar
      drawCtx.fillStyle = statusTheme.headBg;
      drawCtx.fillRect(cardX + 1, y + 1, cardW - 2, 54);
      drawCtx.fillStyle = statusTheme.accent;
      drawCtx.fillRect(cardX, y, 7, partCardH);

      // Coverage Badge on Right (no part marks x/y)
      drawCtx.font = `bold 22px ${fontFamily}`;
      const covBadgeW = Math.ceil(drawCtx.measureText(covStatus).width) + 28;
      const covBadgeX = cardX + cardW - covBadgeW - 18;
      drawBadge(drawCtx, covStatus, covBadgeX, y + 37, statusTheme.badgeTone);

      // Part Title on Left
      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#0f172a';
      drawCtx.font = `bold 27px ${fontFamily}`;
      drawCtx.fillText(`📌 भाग ${idx + 1}: ${p.part_name}`, cardX + 22, y + 38, cardW - covBadgeW - 60);

      // Inner Deduction & Improvement Sub-box
      const subX = cardX + 20;
      const subY = y + 62;
      const subW = cardW - 36;
      drawCtx.fillStyle = '#f8fafc';
      drawCtx.fillRect(subX, subY, subW, innerSubBoxH);
      drawCtx.strokeStyle = '#cbd5e1';
      drawCtx.lineWidth = 1.4;
      drawCtx.strokeRect(subX, subY, subW, innerSubBoxH);

      let textStartY = subY + 36;
      if (hasBadgesRow) {
        let bx = subX + 16;
        drawCtx.fillStyle = '#475569';
        drawCtx.font = `bold 24px ${fontFamily}`;
        drawCtx.textAlign = 'left';
        drawCtx.fillText('📉 मूल्यांकन एवं सुधार:', bx, subY + 35);
        bx += Math.ceil(drawCtx.measureText('📉 मूल्यांकन एवं सुधार:').width) + 16;

        if (pd?.tag) {
          const w = drawBadge(drawCtx, pd.tag, bx, subY + 35, pd.tagTone || 'amber');
          bx += w + 12;
        }
        if (pd?.gapType) {
          drawBadge(drawCtx, `कमी: ${pd.gapType}`, bx, subY + 35, 'grey');
        }
        textStartY = subY + 78;
      }

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#0f172a';
      drawCtx.font = `600 27px ${fontFamily}`;
      reasonLines.forEach((rl, rIdx) => {
        drawCtx.fillText(rl, subX + 18, textStartY + rIdx * 40);
      });

      curPage.usedHeight += partCardH + 14;
    }

    // Top 3 Priority Improvements Box (अंक बढ़ाने हेतु प्रमुख सुधार (प्राथमिकता क्रम))
    if (marksDist.body.missingPoints && marksDist.body.missingPoints.length > 0) {
      const items = marksDist.body.missingPoints.slice(0, 3);
      const lineH = 40;
      const iCtx = curPage.ctx;
      iCtx.font = `600 27px ${fontFamily}`;

      const measuredItems = items.map((mp, idx) => {
        const isFocus = idx === 0;
        const heading = isFocus
          ? '🎯 1. अगली कॉपी का एक फोकस (Top Priority Focus):'
          : `➕ ${idx + 1}. प्रमुख सुधार (Key Value Addition):`;
        const lines = wrapLines(iCtx, mp, cardW - 76);
        const boxH = 46 + lines.length * lineH + 16;
        return { isFocus, heading, lines, boxH };
      });

      const headerBarH = 58;
      const totalItemsH = measuredItems.reduce((acc, it) => acc + it.boxH + 12, 0);
      const blockH = headerBarH + totalItemsH + 18;

      ensureSpace(blockH + 16);
      drawCtx = curPage.ctx;
      y = curPage.usedHeight;

      drawCtx.fillStyle = '#ffffff';
      drawCtx.fillRect(cardX, y, cardW, blockH);
      drawCtx.strokeStyle = '#f59e0b';
      drawCtx.lineWidth = 2.2;
      drawCtx.strokeRect(cardX, y, cardW, blockH);

      drawCtx.fillStyle = '#fef3c7';
      drawCtx.fillRect(cardX + 1, y + 1, cardW - 2, headerBarH);
      drawCtx.fillStyle = '#d97706';
      drawCtx.fillRect(cardX, y, 8, blockH);

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#78350f';
      drawCtx.font = `bold 28px ${fontFamily}`;
      drawCtx.fillText('🎯 अंक बढ़ाने हेतु प्रमुख सुधार (प्राथमिकता क्रम):', cardX + 22, y + 38);

      let itemY = y + headerBarH + 14;
      for (const it of measuredItems) {
        const ix = cardX + 20;
        const iw = cardW - 36;
        drawCtx.fillStyle = it.isFocus ? '#fffbeb' : '#f8fafc';
        drawCtx.fillRect(ix, itemY, iw, it.boxH);
        drawCtx.strokeStyle = it.isFocus ? '#f59e0b' : '#cbd5e1';
        drawCtx.lineWidth = it.isFocus ? 2 : 1.5;
        drawCtx.strokeRect(ix, itemY, iw, it.boxH);

        drawCtx.fillStyle = it.isFocus ? '#d97706' : '#64748b';
        drawCtx.fillRect(ix, itemY, 6, it.boxH);

        drawCtx.textAlign = 'left';
        drawCtx.fillStyle = it.isFocus ? '#92400e' : '#334155';
        drawCtx.font = `bold 25px ${fontFamily}`;
        drawCtx.fillText(it.heading, ix + 18, itemY + 34);

        drawCtx.fillStyle = '#0f172a';
        drawCtx.font = `600 27px ${fontFamily}`;
        it.lines.forEach((ln, lIdx) => {
          drawCtx.fillText(ln, ix + 18, itemY + 74 + lIdx * lineH);
        });

        itemY += it.boxH + 12;
      }

      curPage.usedHeight += blockH + 16;
    }

    // Verified Points Box (सत्यापित सबल बिंदु — only if returned by model)
    if (marksDist.body.matchedPoints && marksDist.body.matchedPoints.length > 0) {
      const mCtx2 = curPage.ctx;
      mCtx2.font = `600 27px ${fontFamily}`;
      const wrappedPts = marksDist.body.matchedPoints.map((pt) => wrapLines(mCtx2, `✓ ${pt}`, cardW - 64));
      const totalLines = wrappedPts.reduce((acc, lns) => acc + lns.length, 0);
      const boxH = 58 + totalLines * 40 + 20;

      ensureSpace(boxH + 16);
      drawCtx = curPage.ctx;
      y = curPage.usedHeight;

      drawCtx.fillStyle = '#f0fdf4';
      drawCtx.fillRect(cardX, y, cardW, boxH);
      drawCtx.strokeStyle = '#4ade80';
      drawCtx.lineWidth = 2;
      drawCtx.strokeRect(cardX, y, cardW, boxH);
      drawCtx.fillStyle = '#16a34a';
      drawCtx.fillRect(cardX, y, 7, boxH);

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#14532d';
      drawCtx.font = `bold 27px ${fontFamily}`;
      drawCtx.fillText('✅ सत्यापित सबल बिंदु (Verified Strong Points):', cardX + 22, y + 38);

      let py = y + 78;
      drawCtx.fillStyle = '#0f172a';
      drawCtx.font = `600 27px ${fontFamily}`;
      wrappedPts.forEach((lns) => {
        lns.forEach((ln) => {
          drawCtx.fillText(ln, cardX + 24, py);
          py += 40;
        });
      });

      curPage.usedHeight += boxH + 16;
    }
  }

  // 3. प्रस्तुतीकरण एवं संरचना (PRESENTATION AUDIT)
  if (marksDist) {
    const presSubBoxes: Array<{ heading: string; text: string; bg: string; border: string; accent: string; headCol: string }> = [];
    if (marksDist.presentation.formatAndFlow) {
      presSubBoxes.push({
        heading: '📐 प्रारूप, उप-शीर्षक एवं प्रवाह (Format & Flow):',
        text: marksDist.presentation.formatAndFlow,
        bg: '#fff7ed',
        border: '#fdba74',
        accent: '#ea580c',
        headCol: '#7c2d12'
      });
    }
    if (marksDist.presentation.legibilityAndSpacing) {
      presSubBoxes.push({
        heading: '✍️ पठनीयता एवं प्रस्तुति अनुशासन (Legibility):',
        text: marksDist.presentation.legibilityAndSpacing,
        bg: '#f8fafc',
        border: '#cbd5e1',
        accent: '#475569',
        headCol: '#1e293b'
      });
    }
    if (marksDist.presentation.diagramScope) {
      presSubBoxes.push({
        heading: '🗺️ आरेख / फ्लोचार्ट / मानचित्र गुंजाइश (Diagram Scope):',
        text: marksDist.presentation.diagramScope,
        bg: '#eff6ff',
        border: '#93c5fd',
        accent: '#2563eb',
        headCol: '#1e3a8a'
      });
    }

    if (presSubBoxes.length > 0) {
      const cardX = 30;
      const cardW = width - 60;
      const lineH = 40;
      const mCtx = curPage.ctx;
      mCtx.font = `600 27px ${fontFamily}`;

      const measured = presSubBoxes.map((sb) => {
        const lines = wrapLines(mCtx, sb.text, cardW - 72);
        const boxH = 46 + lines.length * lineH + 16;
        return { ...sb, lines, boxH };
      });

      const headerH = 60;
      const totalSubH = measured.reduce((acc, b) => acc + b.boxH + 14, 0);
      const totalCardH = headerH + totalSubH + 18;

      ensureSpace(totalCardH + 18);
      const drawCtx = curPage.ctx;
      const y = curPage.usedHeight;

      drawCtx.fillStyle = '#ffffff';
      drawCtx.fillRect(cardX, y, cardW, totalCardH);
      drawCtx.strokeStyle = '#fb923c';
      drawCtx.lineWidth = 2.2;
      drawCtx.strokeRect(cardX, y, cardW, totalCardH);

      drawCtx.fillStyle = '#ffedd5';
      drawCtx.fillRect(cardX + 1, y + 1, cardW - 2, headerH);
      drawCtx.fillStyle = '#ea580c';
      drawCtx.fillRect(cardX, y, 8, totalCardH);

      drawCtx.textAlign = 'left';
      drawCtx.fillStyle = '#7c2d12';
      drawCtx.font = `bold 29px ${fontFamily}`;
      drawCtx.fillText('📊 3. प्रस्तुतीकरण एवं संरचना (Presentation & Structure)', cardX + 22, y + 40);

      drawCtx.textAlign = 'right';
      drawCtx.font = `900 28px ${fontFamily}`;
      drawCtx.fillText(
        `${formatQuarterMark(marksDist.presentation.score)} / ${formatQuarterMark(marksDist.presentation.max)} (${marksDist.presentation.percent}%)`,
        cardX + cardW - 20,
        y + 40
      );

      let subY = y + headerH + 14;
      for (const sb of measured) {
        const sbX = cardX + 20;
        const sbW = cardW - 36;
        drawCtx.fillStyle = sb.bg;
        drawCtx.fillRect(sbX, subY, sbW, sb.boxH);
        drawCtx.strokeStyle = sb.border;
        drawCtx.lineWidth = 1.6;
        drawCtx.strokeRect(sbX, subY, sbW, sb.boxH);
        drawCtx.fillStyle = sb.accent;
        drawCtx.fillRect(sbX, subY, 6, sb.boxH);

        drawCtx.textAlign = 'left';
        drawCtx.fillStyle = sb.headCol;
        drawCtx.font = `bold 25px ${fontFamily}`;
        drawCtx.fillText(sb.heading, sbX + 18, subY + 34);

        drawCtx.fillStyle = '#0f172a';
        drawCtx.font = `600 27px ${fontFamily}`;
        sb.lines.forEach((ln, lIdx) => {
          drawCtx.fillText(ln, sbX + 18, subY + 74 + lIdx * lineH);
        });

        subY += sb.boxH + 14;
      }

      curPage.usedHeight += totalCardH + 18;
    }
  }

  // 4. निष्कर्ष एवं आगे की राह (CONCLUSION AUDIT)
  if (marksDist) {
    drawRichPillarBoxCard({
      sectionTitle: '✨ 4. निष्कर्ष एवं आगे की राह (Conclusion Audit)',
      scoreBadgeText: `${formatQuarterMark(marksDist.conclusion.score)} / ${formatQuarterMark(marksDist.conclusion.max)} (${marksDist.conclusion.percent}%)`,
      headerBg: '#d1fae5',
      headerBorder: '#34d399',
      headerTextColor: '#064e3b',
      accentColor: '#059669',
      strengthsText: marksDist.conclusion.strengths,
      strengthsTag: marksDist.conclusion.strengthsTag,
      strengthsTone: marksDist.conclusion.strengthsTone,
      improvementsText: marksDist.conclusion.improvements,
      idealLabel: '💡 आदर्श दृष्टिकोण:',
      idealText: marksDist.conclusion.idealApproach
    });
  }

  // Crop each canvas to its exact content height with the classic double-border frame
  return pages.map((pObj) => {
    const finalHeight = Math.max(400, Math.ceil(pObj.usedHeight + 32));
    const trimmed = document.createElement('canvas');
    trimmed.width = width;
    trimmed.height = finalHeight;
    const tCtx = trimmed.getContext('2d', { alpha: false })!;
    tCtx.fillStyle = '#f8fafc';
    tCtx.fillRect(0, 0, width, finalHeight);
    tCtx.drawImage(pObj.canvas, 0, 0, width, finalHeight, 0, 0, width, finalHeight);

    // Classic UPSC Scorecard Outer Slate + Inner Gold Frame
    tCtx.strokeStyle = '#1e293b';
    tCtx.lineWidth = 4;
    tCtx.strokeRect(10, 10, width - 20, finalHeight - 20);
    tCtx.strokeStyle = '#f59e0b';
    tCtx.lineWidth = 1.5;
    tCtx.strokeRect(16, 16, width - 32, finalHeight - 32);

    return trimmed.toDataURL('image/jpeg', 0.92);
  });
};

export const exportEvaluationPagesToPDF = async (params: {
  targetResult: EvaluationResult;
  targetPages: UploadedPage[];
  targetStudentName: string;
  targetOriginalFileName?: string;
  annotationFont: 'kalam' | 'mukta';
  branding?: { instituteName?: string; instituteTagline?: string } | null;
  onProgress?: (percent: number) => void;
  showToast: (msg: string) => void;
  setErrorMessage: (msg: string | null) => void;
}) => {
  const {
    targetResult,
    targetPages,
    targetStudentName,
    targetOriginalFileName,
    annotationFont,
    branding,
    onProgress,
    showToast,
    setErrorMessage
  } = params;

  if (!targetResult || !targetPages || targetPages.length === 0) {
    showToast('डाउनलोड के लिए पृष्ठ उपलब्ध नहीं हैं।');
    return;
  }
  onProgress?.(15);

  try {
    await new Promise((r) => setTimeout(r, 50));

    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const totalPages = targetPages.length;

    for (let i = 0; i < totalPages; i++) {
      const upPage = targetPages[i];
      const pageNum = i + 1;
      const pageResult = targetResult.pages.find((p) => p.page_number === pageNum);
      const annotations = pageResult ? pageResult.annotations : [];

      const imgData = upPage.dataUrl;

      const img = new Image();
      img.src = imgData;
      await new Promise((resolve) => {
        if (img.complete) {
          resolve(true);
        } else {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(true);
        }
      });

      const A4_WIDTH = 1200;
      const A4_HEIGHT = 1697;
      const isLandscape = (img.width || 0) > (img.height || 0);
      const imgWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
      const imgHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;

      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imgWidth, imgHeight);
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

        if (pageNum === 1) {
          const marksStr = `${targetResult.total_marks.obtained} / ${targetResult.total_marks.max_marks}`;
          const baseRadius = Math.max(44, Math.round(imgWidth * 0.062));
          const fontSize = Math.max(18, Math.floor(baseRadius * 0.44));
          ctx.font = `900 ${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(marksStr).width;
          const circleRadius = Math.max(baseRadius, Math.ceil(textWidth * 0.62) + 14);
          const safeRightMargin = Math.max(28, Math.round(imgWidth * 0.028));
          const circleX = imgWidth - circleRadius - safeRightMargin;
          const circleY = circleRadius + Math.max(24, Math.round(imgWidth * 0.022));

          ctx.beginPath();
          ctx.arc(circleX, circleY, circleRadius, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.fill();
          ctx.lineWidth = Math.max(2.5, imgWidth * 0.005);
          ctx.strokeStyle = '#dc2626';
          ctx.stroke();

          ctx.font = `900 ${fontSize}px sans-serif`;
          ctx.fillStyle = '#dc2626';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marksStr, circleX, circleY, circleRadius * 1.75);
          ctx.textAlign = 'left';
        }

        const effectiveFont = targetResult.annotation_font || annotationFont;
        const fontSize = Math.max(15, Math.floor(imgWidth * 0.0175));
        if (typeof document !== 'undefined' && document.fonts?.load) {
          try {
            await document.fonts.load(`bold ${fontSize}px "Kalam"`);
            if (effectiveFont === 'mukta') {
              await document.fonts.load(`bold ${fontSize}px "Mukta"`);
            }
          } catch (fontErr) {
            console.warn('Font load fallback:', fontErr);
          }
        }

        const savedDefaultScaleRaw = typeof window !== 'undefined' ? localStorage.getItem('upsc_default_annotation_font_scale') : null;
        const savedDefaultScale = savedDefaultScaleRaw ? parseFloat(savedDefaultScaleRaw) : 1.0;
        const baseScale = targetResult.default_font_scale || (Number.isFinite(savedDefaultScale) ? savedDefaultScale : 1.0);

        const placedPdfAnns = computeDynamicAnnotationPlacement(annotations, {
          maxBottomPercent: 85.5,
          defaultFontScale: baseScale
        });

        placedPdfAnns.forEach((ann) => {
          const isStamp = ann.isStamp || isAnnotationStamp(ann.text);
          const isLeft = ann.isLeft;
          const effectiveYPercent = ann._adjustedY;

          const yPos = (effectiveYPercent / 100) * imgHeight;
          const widthNum = ann.width_percent || 13.5;
          const customWidthPercent = widthNum / 100;
          const maxWidth = imgWidth * customWidthPercent;

          const xPos = isStamp
            ? (ann.x_percent / 100) * imgWidth
            : ann.is_custom_positioned
              ? (Math.max(0.5, Math.min(99 - widthNum, ann.x_percent)) / 100) * imgWidth
              : isLeft
                ? imgWidth * 0.004
                : Math.max(imgWidth * 0.5, (imgWidth * 0.994) - maxWidth);

          if (isStamp) {
            const stampFontSize = Math.max(26, Math.floor(imgWidth * 0.04));
            ctx.font = `900 ${stampFontSize}px sans-serif`;
            ctx.fillStyle = '#4338ca';
            ctx.textBaseline = 'middle';
            ctx.fillText(ann.text, xPos, yPos);
          } else {
            const fontFamily = effectiveFont === 'mukta'
              ? '"Mukta", "Noto Sans Devanagari", sans-serif'
              : '"Kalam", "Noto Sans Devanagari", cursive, sans-serif';

            const savedDefaultScaleRaw = typeof window !== 'undefined' ? localStorage.getItem('upsc_default_annotation_font_scale') : null;
            const savedDefaultScale = savedDefaultScaleRaw ? parseFloat(savedDefaultScaleRaw) : 1.0;
            const fontScale = ann.font_scale || targetResult.default_font_scale || (Number.isFinite(savedDefaultScale) ? savedDefaultScale : 1.0);
            const effectiveFontSize = Math.round(fontSize * fontScale);
            const isBold = ann.is_bold !== undefined ? ann.is_bold : true;
            const isItalic = Boolean(ann.is_italic);
            const isUnderline = Boolean(ann.is_underline);
            const fontStylePrefix = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : '400 '}`;
            ctx.font = `${fontStylePrefix}${effectiveFontSize}px ${fontFamily}`;
            ctx.fillStyle = '#b91c1c';
            ctx.textBaseline = 'middle';

            const drawTextLineWithOptionalUnderline = (lineText: string, drawX: number, drawY: number) => {
              const trimmedLine = lineText.trimEnd();
              ctx.fillText(lineText, drawX, drawY);
              if (isUnderline && trimmedLine.length > 0) {
                const lineW = ctx.measureText(trimmedLine).width;
                const underlineThickness = Math.max(1.5, Math.round(effectiveFontSize * 0.065));
                ctx.fillRect(drawX, drawY + effectiveFontSize * 0.44, lineW, underlineThickness);
              }
            };

            const words = ann.text.split(' ');
            let line = '';
            let currentY = yPos;
            const lineHeight = effectiveFontSize * 1.32;

            for (let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxWidth && n > 0) {
                drawTextLineWithOptionalUnderline(line, xPos, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
              } else {
                line = testLine;
              }
            }
            drawTextLineWithOptionalUnderline(line, xPos, currentY);
          }
        });

        // Keep the copy margin-annotation page rendering unchanged
        const sheetBrandName =
          branding?.instituteName?.trim() || 'उत्तर-पुस्तिका मूल्यांकन पोर्टल';
        const sheetBrandTagline =
          branding?.instituteTagline?.trim() ||
          'AI-सहायित मूल्यांकन';
        const footerBarHeight = Math.max(32, Math.round(imgHeight * 0.022));
        const footerY = imgHeight - footerBarHeight;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(0, footerY, imgWidth, footerBarHeight);

        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, footerY, imgWidth, 2);

        const footerFontSize = Math.max(12, Math.round(footerBarHeight * 0.44));
        ctx.font = `bold ${footerFontSize}px "Mukta", "Noto Sans Devanagari", sans-serif`;
        ctx.textBaseline = 'middle';

        ctx.textAlign = 'left';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(
          `${sheetBrandName}  •  ${sheetBrandTagline}`,
          18,
          footerY + footerBarHeight / 2
        );

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(
          `AI-सहायित मूल्यांकन | प्राप्तांक: ${targetResult.total_marks.obtained}/${targetResult.total_marks.max_marks} | पृष्ठ ${pageNum}/${totalPages}`,
          imgWidth - 18,
          footerY + footerBarHeight / 2
        );
        ctx.textAlign = 'left';
      }

      const renderedImgData = canvas.toDataURL('image/jpeg', 0.80);

      if (i === 0) {
        doc.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'landscape' : 'portrait');
        doc.deletePage(1);
      } else {
        doc.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'landscape' : 'portrait');
      }
      doc.addImage(renderedImgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

      onProgress?.(20 + Math.round(((i + 1) / totalPages) * 65));
      await new Promise((r) => setTimeout(r, 10));
    }

    onProgress?.(88);
    try {
      const scorecardImgs = await createAuditScorecardPages(targetResult, targetStudentName, branding);
      if (scorecardImgs && scorecardImgs.length > 0) {
        for (const sImg of scorecardImgs) {
          const sImgEl = new Image();
          sImgEl.src = sImg;
          await new Promise((resolve) => {
            if (sImgEl.complete) resolve(true);
            else {
              sImgEl.onload = () => resolve(true);
              sImgEl.onerror = () => resolve(true);
            }
          });
          const sW = sImgEl.width || 1200;
          const sH = sImgEl.height || 1200;
          doc.addPage([sW, sH], sW > sH ? 'landscape' : 'portrait');
          doc.addImage(sImg, 'JPEG', 0, 0, sW, sH, undefined, 'FAST');
        }
      }
    } catch (scorecardErr) {
      console.warn('Scorecard page generation fallback:', scorecardErr);
    }

    onProgress?.(95);
    const isValidNameCandidate = (val?: string): boolean => {
      if (!val || typeof val !== 'string') return false;
      const t = val.trim();
      if (!t || t.length < 2) return false;
      if (/^(?:undefined|null|nan|unknown|unknown\s+student|अनाम\s*अभ्यर्थी)(?:_evaluated)?(?:\.pdf)?$/i.test(t)) {
        return false;
      }
      return true;
    };

    let exportFileName = 'Answer_Evaluation_Report.pdf';
    const stripEmbeddedUndefined = (s: string) =>
      s.replace(/[_\-\s]*\b(?:undefined|null|nan)\b[_\-\s]*/gi, '_').replace(/^_+|_+$/g, '').replace(/_{2,}/g, '_').trim();

    if (isValidNameCandidate(targetOriginalFileName)) {
      const cleanOrig = stripEmbeddedUndefined(targetOriginalFileName!.trim());
      if (isValidNameCandidate(cleanOrig)) {
        exportFileName = cleanOrig.toLowerCase().endsWith('.pdf')
          ? cleanOrig
          : `${cleanOrig.replace(/\.[^/.]+$/, '')}.pdf`;
      }
    } else if (isValidNameCandidate(targetStudentName)) {
      const cleanStu = stripEmbeddedUndefined(targetStudentName.trim());
      if (isValidNameCandidate(cleanStu)) {
        exportFileName = cleanStu.toLowerCase().endsWith('.pdf') ? cleanStu : `${cleanStu}.pdf`;
      }
    }
    exportFileName = exportFileName.replace(/[/\\?%*:|"<>]/g, '_');

    await new Promise((r) => setTimeout(r, 50));

    const pdfBlob = doc.output('blob');
    let downloaded = false;

    const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (!isInIframe && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: exportFileName,
          types: [{
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        downloaded = true;
      } catch (pickerErr: any) {
        if (pickerErr?.name !== 'AbortError') {
          console.warn('Save picker unavailable or rejected, using direct download:', pickerErr);
        }
      }
    }

    if (!downloaded) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = exportFileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);

      try {
        a.click();
        downloaded = true;
      } catch (clickErr) {
        console.warn('Direct link click failed, falling back to window.open:', clickErr);
        try {
          window.open(blobUrl, '_blank');
          downloaded = true;
        } catch (winErr) {
          console.error('Window open fallback failed:', winErr);
        }
      }

      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      }, 3000);
    }

    onProgress?.(100);
    showToast(`📥 ${exportFileName} डाउनलोड हो गई!`);
  } catch (err) {
    console.error('Error generating PDF: ', err);
    setErrorMessage('PDF फाइल बनाने में त्रुटि आई। कृपया फिर से प्रयास करें।');
  }
};
