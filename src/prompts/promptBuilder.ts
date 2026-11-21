/**
 * Dynamic Prompt Assembler (Universal Slot 1 Master Prompt — Zero Subject-Specific Overrides)
 */

import { MASTER_8_BLOCK_PROMPT } from '../defaultPrompt';

export interface PromptBuildContext {
  subject?: string;
  maxMarks?: number;
  questionText?: string;
  modelAnswer?: string;
  rubricRules?: string;
  customSlotPrompt?: string;
  evaluationStrictness?: 'liberal' | 'standard' | 'strict' | string;
  feedbackDetailLevel?: 'standard' | 'comprehensive' | 'actionable' | string;
  valueAdditionFocus?: boolean;
  ocrSensitivity?: 'standard' | 'high_precision' | string;
  feedbackLanguage?: 'pure_hindi' | 'bilingual' | 'english' | string;
  maxOutputTokens?: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto' | string;
}

function sanitizeUntrustedInput(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?(MODEL_ANSWER|RUBRIC_RULES|SYSTEM|INSTRUCTION|OVERRIDE)[^>]*>/gi, '')
    .replace(/\[सत्र संदर्भ\]/g, '')
    .trim();
}

export function getSessionContext(ctxInput: PromptBuildContext): string {
  const maxMarks = ctxInput.maxMarks || 10;
  const parts: string[] = [`[सत्र संदर्भ: डिफ़ॉल्ट पूर्णांक ${maxMarks} अंक]`];

  if (ctxInput.feedbackLanguage === 'english') {
    parts.push('Output Language: English Only');
  }

  const cleanQuestion = sanitizeUntrustedInput(ctxInput.questionText);
  if (cleanQuestion.length > 0) {
    parts.push(`[मूल्यांकित प्रश्न]\n"""\n${cleanQuestion}\n"""`);
  }

  const cleanModelAns = sanitizeUntrustedInput(ctxInput.modelAnswer);
  if (cleanModelAns.length > 0) {
    parts.push(`<MODEL_ANSWER>\n${cleanModelAns}\n</MODEL_ANSWER>`);
  }

  const cleanRubrics = sanitizeUntrustedInput(ctxInput.rubricRules);
  const isDefaultBoilerplateRubric =
    cleanRubrics.includes('1. भूमिका संक्षिप्त और सटीक हो।') &&
    cleanRubrics.includes('2. मुख्य भाग में बुलेट पॉइंट्स या उप-शीर्षक का प्रयोग हो।');
  if (cleanRubrics.length > 0 && !isDefaultBoilerplateRubric) {
    parts.push(`<RUBRIC_RULES>\n${cleanRubrics}\n</RUBRIC_RULES>`);
  }

  return parts.join('\n\n');
}

export function buildModularPrompt(ctx: PromptBuildContext): string {
  const baseCore =
    ctx.customSlotPrompt && ctx.customSlotPrompt.trim().length > 100
      ? ctx.customSlotPrompt.trim()
      : MASTER_8_BLOCK_PROMPT;

  const sessionCtx = getSessionContext(ctx);

  return `${baseCore}\n\n${sessionCtx}`;
}
