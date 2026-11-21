import { buildModularPrompt } from './src/prompts/promptBuilder';
import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { jsonrepair } from 'jsonrepair';
import {
  sanitizeAnnotationText,
  deduplicateAndDiversifyPageAnnotations,
  computeTokenOverlapRatio,
  normalizeFixedGlossaryTerms
} from './src/utils/annotationSanitizer';
import { cleanSubpartTitle, stripDuplicateRubricPrefix, cleanComparisonPoint } from './src/utils/scorecardExport';
import { currentSystemPrompt, defaultSystemPrompt, updateSystemPrompt, currentSlotId, currentSlotName } from './prompt_store.js';

dotenv.config();

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();

// Increase body limit to handle multi-page handwritten image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve a self-unregistering Service Worker at /sw.js so any previously cached Service Worker
// in the browser clears its stale cache and never intercepts AI Studio auth tokens or /api routes
app.get(['/sw.js', '/registerSW.js'], (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(`
    self.addEventListener('install', function() { self.skipWaiting(); });
    self.addEventListener('activate', function(event) {
      event.waitUntil(
        caches.keys()
          .then(function(keys) { return Promise.all(keys.map(function(k) { return caches.delete(k); })); })
          .then(function() { return self.registration.unregister(); })
      );
    });
  `);
});

// Lightweight health and session cookie sync endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return cleaned;
}

function safeParseJson(rawText: string): any {
  if (!rawText) throw new Error('Empty text received for JSON parsing');
  const cleaned = cleanJsonResponse(rawText);

  // 1. Try standard JSON.parse first
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.warn(`[JSON Parse] Direct parse failed (${err.message}). Attempting jsonrepair...`);
  }

  // 2. Try jsonrepair on cleaned text
  try {
    const repaired = jsonrepair(cleaned);
    return JSON.parse(repaired);
  } catch (err: any) {
    console.warn(`[JSON Parse] jsonrepair on cleaned text failed (${err.message}). Trying on raw text...`);
  }

  // 3. Try jsonrepair on raw text directly
  try {
    const repairedRaw = jsonrepair(rawText);
    return JSON.parse(repairedRaw);
  } catch (err: any) {
    console.warn(`[JSON Parse] jsonrepair on raw text failed (${err.message}). Trying candidate extraction...`);
  }

  // 4. Try extracting from first '{' to last '}' and repair
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1) {
    const candidate = lastBrace > firstBrace ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned.substring(firstBrace);
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch (err3: any) {
      console.warn(`[JSON Parse] Candidate jsonrepair failed:`, err3?.message);
    }
  }

  // 5. Try fixing truncated JSON strings by balancing quotes and braces
  try {
    let candidate = firstBrace !== -1 ? cleaned.substring(firstBrace) : cleaned;
    const quotes = (candidate.match(/(?<!\\)"/g) || []).length;
    if (quotes % 2 !== 0) {
      candidate += '"';
    }
    return JSON.parse(jsonrepair(candidate));
  } catch (err4: any) {
    console.error(`[JSON Parse] All JSON repair strategies failed:`, err4);
    throw new Error(`SyntaxError in AI response JSON at character position: ${err4.message}`);
  }
}

// Helper function to query Gemini with retry on transient load and automatic fallback
async function generateContentWithRetry(aiClient: any, params: any, maxRetries = 2) {
  // Prioritize user-selected cascade, then high-availability models
  let userRequestedModels = params.requestedModels || [];
  if (typeof userRequestedModels === 'string') userRequestedModels = [userRequestedModels];

  // Sanitize legacy or removed model names to the 2 supported models: gemini-4-hydrogen and gemini-3.8-flash
  const sanitizeModelName = (name: string): string => {
    if (!name) return 'gemini-4-hydrogen';
    const lower = name.toLowerCase().trim();
    if (lower === 'gemini-4-hydrogen' || lower === 'gemini-3.8-flash') {
      return lower;
    }
    if (
      lower.includes('3.6-flash') ||
      lower.includes('2.5-flash') ||
      lower.includes('2.0-flash') ||
      lower.includes('1.5-flash') ||
      lower.includes('3.1-flash') ||
      lower.includes('4-hydrogen') ||
      lower === 'gemini-flash'
    ) {
      return 'gemini-4-hydrogen';
    }
    return 'gemini-4-hydrogen';
  };

  const rawModels = [
    ...userRequestedModels,
    params.model,
    'gemini-4-hydrogen',
    'gemini-3.8-flash'
  ];
  const sanitizedList = rawModels.map(m => typeof m === 'string' ? sanitizeModelName(m) : m);
  const uniqueModels = Array.from(new Set(sanitizedList)).filter(Boolean);
  const primaryModel = uniqueModels[0];
  // Point 27: Retry primary model (gemini-4-hydrogen) once before falling back to secondary model (gemini-3.8-flash)
  const modelsToTry =
    uniqueModels.length > 1 ? [primaryModel, primaryModel, ...uniqueModels.slice(1)] : [primaryModel];

  let lastError: any = null;
  const executionHistory: Array<{
    model: string;
    attempt: number;
    role: 'primary' | 'fallback';
    status: 'success' | 'quota_exhausted' | 'high_demand' | 'invalid_argument' | 'not_found' | 'failed';
    status_code?: number | string;
    latency_ms: number;
    error_message?: string;
    tokens: {
      prompt_tokens: number;
      cached_tokens?: number;
      thinking_tokens?: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }> = [];

  const disqualifiedModels = new Set<string>();

  // Multi-pass cascade to survive temporary Google 503 high-demand bursts
  const MAX_PASSES = 2;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    // If we're on pass 2, wait ~1.2 seconds to allow transient 503 load spikes to clear
    if (pass > 1) {
      const spikeRecoveryDelay = 1200 + Math.floor(Math.random() * 400);
      console.log(`[AI Evaluation] Pass 1 completed without response. Waiting ${spikeRecoveryDelay}ms before Pass 2...`);
      await new Promise(res => setTimeout(res, spikeRecoveryDelay));
    }

    for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
      const modelName = modelsToTry[modelIndex];
      if (disqualifiedModels.has(modelName)) {
        continue;
      }

      const isPrimary = (modelName === primaryModel && pass === 1);

      // Clone params so we can safely adjust config if needed
      const currentParams = JSON.parse(JSON.stringify(params));
      if (currentParams.config) {
        if (!currentParams.config.maxOutputTokens || currentParams.config.maxOutputTokens > 16384) {
          currentParams.config.maxOutputTokens = 12288;
        }
        // Respect caller's thinkingConfig if explicitly set in params.config
        if (params.config && params.config.thinkingConfig !== undefined) {
          currentParams.config.thinkingConfig = params.config.thinkingConfig;
        } else {
          delete currentParams.config.thinkingConfig;
        }
        // Gemini 4 models (gemini-4-hydrogen) do not accept legacy temperature, topP, topK, candidateCount, thinkingBudget, or ThinkingLevel.MINIMAL
        if (modelName.startsWith('gemini-4-')) {
          delete currentParams.config.temperature;
          delete currentParams.config.topP;
          delete currentParams.config.topK;
          delete currentParams.config.candidateCount;
          if (currentParams.config.thinkingConfig && 'thinkingBudget' in currentParams.config.thinkingConfig) {
            currentParams.config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }
          if (currentParams.config.thinkingConfig?.thinkingLevel === ThinkingLevel.MINIMAL) {
            currentParams.config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }
        }
        // ThinkingLevel.XHIGH is only supported on gemini-4-hydrogen; gracefully map to HIGH on fallback models
        if (modelName !== 'gemini-4-hydrogen' && currentParams.config.thinkingConfig?.thinkingLevel === ThinkingLevel.XHIGH) {
          currentParams.config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
      }

      let attemptStart = Date.now();
      try {
        console.log(`[AI Evaluation] Pass ${pass} (model #${modelIndex + 1}/${modelsToTry.length}) using model: ${modelName}...`);
        const response = await aiClient.models.generateContent({
          ...currentParams,
          model: modelName
        });
        const latencyMs = Date.now() - attemptStart;
        (response as any).modelUsed = modelName;

        const promptTokens = response.usageMetadata?.promptTokenCount || 0;
        const cachedTokens = (response.usageMetadata as any)?.cachedContentTokenCount || 0;
        const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const totalTokens = response.usageMetadata?.totalTokenCount || (promptTokens + completionTokens);
        const thinkingTokens = (response.usageMetadata as any)?.thoughtsTokenCount || Math.max(0, totalTokens - (promptTokens + completionTokens));

        executionHistory.push({
          model: modelName,
          attempt: pass,
          role: isPrimary ? 'primary' : 'fallback',
          status: 'success',
          status_code: 200,
          latency_ms: latencyMs,
          tokens: {
            prompt_tokens: promptTokens,
            cached_tokens: cachedTokens,
            thinking_tokens: thinkingTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens
          }
        });

        (response as any).primaryModelRequested = primaryModel;
        (response as any).fallbackOccurred = (modelName !== primaryModel) || (executionHistory.length > 1);
        (response as any).executionHistory = executionHistory;
        return response; // Success! Return immediately.
      } catch (caughtIssue: any) {
        const latencyMs = Date.now() - attemptStart;
        lastError = caughtIssue;
        const errObj = caughtIssue?.error || caughtIssue;
        const errMsg = errObj?.message || caughtIssue?.message || '';
        const errStatus = errObj?.status || errObj?.code || caughtIssue?.status || caughtIssue?.code || '';
        const errStr = (String(errMsg) + ' ' + String(errStatus) + ' ' + JSON.stringify(caughtIssue)).toLowerCase();

        // Classify status for transparent audit & telemetry
        let statusType: 'quota_exhausted' | 'high_demand' | 'invalid_argument' | 'not_found' | 'failed' = 'failed';
        let cleanErrorMessage = errMsg || 'Unknown error during model execution';

        // Check for 404/not found or deprecated model
        if (errStatus === 404 || errStr.includes('not found') || errStr.includes('no longer available')) {
          statusType = 'not_found';
          cleanErrorMessage = 'मॉडल उपलब्ध नहीं मिला या अप्रचलित है (404 Model Not Found / Deprecated)';
          disqualifiedModels.add(modelName);
          executionHistory.push({
            model: modelName,
            attempt: pass,
            role: isPrimary ? 'primary' : 'fallback',
            status: statusType,
            status_code: 404,
            latency_ms: latencyMs,
            error_message: cleanErrorMessage,
            tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
          console.log(`[AI Evaluation] Model ${modelName} not found. Skipping to next candidate...`);
          continue;
        }

        // Check for bad request / schema or thinking argument invalid
        if (errStatus === 400 || errStr.includes('invalid_argument') || errStr.includes('not supported')) {
          statusType = 'invalid_argument';
          cleanErrorMessage = 'अमान्य मॉडल पैरामीटर / कॉन्फ़िगरेशन (400 Invalid Argument)';
          disqualifiedModels.add(modelName);
          executionHistory.push({
            model: modelName,
            attempt: pass,
            role: isPrimary ? 'primary' : 'fallback',
            status: statusType,
            status_code: 400,
            latency_ms: latencyMs,
            error_message: cleanErrorMessage,
            tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          });
          console.log(`[AI Evaluation] Unsupported parameter for ${modelName}. Skipping to next candidate...`);
          continue;
        }

        // Is it a strict quota exceeded or 503 high demand?
        const isQuotaExceeded = errStatus === 429 || 
                                String(errStatus) === 'RESOURCE_EXHAUSTED' ||
                                errStr.includes('quota') ||
                                errStr.includes('limit') ||
                                errStr.includes('exhausted') ||
                                errStr.includes('429');
                                
        const isUnavailable = errStatus === 503 || 
                              String(errStatus) === 'UNAVAILABLE' ||
                              errStr.includes('503') ||
                              errStr.includes('high demand') ||
                              errStr.includes('overloaded');

        if (isQuotaExceeded) {
          statusType = 'quota_exhausted';
          cleanErrorMessage = 'कोटा दर-सीमा समाप्त (429 Rate Limit / Quota Exhausted)';
          if (errStr.includes('limit: 0') || errStr.includes('free_tier')) {
            cleanErrorMessage = 'इस मॉडल पर फ्री टियर कोटा शून्य (Limit 0) है; प्रो/पेड बिलिंग आवश्यक है।';
            disqualifiedModels.add(modelName);
            executionHistory.push({
              model: modelName,
              attempt: pass,
              role: isPrimary ? 'primary' : 'fallback',
              status: statusType,
              status_code: 429,
              latency_ms: latencyMs,
              error_message: cleanErrorMessage,
              tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            });
            console.log(`[AI Evaluation] Model ${modelName} has 0 quota. Moving to next candidate...`);
            continue;
          }
        } else if (isUnavailable) {
          statusType = 'high_demand';
          cleanErrorMessage = 'AI सर्वर पर अत्यधिक लोड (503 High Demand / Server Overloaded)';
        }

        executionHistory.push({
          model: modelName,
          attempt: pass,
          role: isPrimary ? 'primary' : 'fallback',
          status: statusType,
          status_code: errStatus || (statusType === 'quota_exhausted' ? 429 : (statusType === 'high_demand' ? 503 : 500)),
          latency_ms: latencyMs,
          error_message: cleanErrorMessage,
          tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        });

        // Wait briefly before retrying / switching to next candidate so brief load spikes don't cause premature failover
        if (isUnavailable || isQuotaExceeded) {
          const delayMs = 1000 + Math.floor(Math.random() * 500);
          console.log(`[AI Evaluation] Model ${modelName} busy (${statusType}). Retrying/switching after ${delayMs}ms...`);
          await new Promise(res => setTimeout(res, delayMs));
        }
      }
    }
  }

  if (lastError) {
    const errObj = lastError?.error || lastError;
    const errStatus = errObj?.status || errObj?.code || lastError?.status || lastError?.code;
    const errStr = (String(errObj?.message || lastError?.message || '') + ' ' + JSON.stringify(lastError)).toLowerCase();
    
    if (errStatus === 429 || errStr.includes('429') || errStr.includes('quota') || errStr.includes('exhausted')) {
      throw new Error("AI API Quota Limit (दर सीमा) समाप्त हो गई है। कृपया 1 मिनट प्रतीक्षा करें या सेटिंग्स में फ्लैश मॉडल चुनें।");
    }
    if (errStatus === 503 || errStr.includes('503') || errStr.includes('high demand') || errStr.includes('unavailable')) {
      throw new Error("Google AI सर्वर पर अभी अत्यधिक लोड (High Demand) है। कृपया कुछ सेकंड बाद पुनः प्रयास करें।");
    }
  }
  
  throw lastError;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/system-prompt', (req, res) => {
  res.json({ 
    prompt: currentSystemPrompt,
    slotId: currentSlotId,
    slotName: currentSlotName
  });
});

app.post('/api/system-prompt', (req, res) => {
  const { prompt, slotId, slotName } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  updateSystemPrompt(prompt, slotId, slotName);
  res.json({ 
    success: true, 
    prompt: currentSystemPrompt,
    slotId: currentSlotId,
    slotName: currentSlotName
  });
});

app.post('/api/system-prompt/reset', (req, res) => {
  updateSystemPrompt(defaultSystemPrompt, 1, 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)');
  res.json({ 
    success: true, 
    prompt: currentSystemPrompt,
    slotId: currentSlotId,
    slotName: currentSlotName
  });
});

// API endpoint for pinging and testing a model's connectivity & latency
app.post('/api/models/test-ping', async (req, res) => {
  const { model: rawModel = 'gemini-4-hydrogen' } = req.body;
  const model = rawModel === 'gemini-3.6-flash' ? 'gemini-4-hydrogen' : rawModel;
  try {
    const start = Date.now();
    const pingConfig: any = {
      maxOutputTokens: 20,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    };

    const response = await ai.models.generateContent({
      model,
      contents: 'Ping test for UPSC evaluation portal. Reply with "PONG".',
      config: pingConfig
    });
    const latencyMs = Date.now() - start;
    res.json({
      success: true,
      model,
      latencyMs,
      message: response.text?.trim() || 'PONG'
    });
  } catch (error: any) {
    const errObj = error?.error || error;
    const errMsg = errObj?.message || error?.message || 'Model ping test failed';
    const errStatus = errObj?.status || errObj?.code || error?.status || error?.code || '';
    let userFriendlyError = errMsg;
    
    if (errMsg.includes('limit: 0') || errMsg.includes('Quota exceeded for metric') || errMsg.includes('free tier') || errMsg.includes('billing')) {
      userFriendlyError = 'इस मॉडल के लिए फ्री टियर कोटा शून्य (Limit: 0) है या पेड बिलिंग (Pay-as-you-go) आवश्यक है।';
    } else if (errMsg.includes('Resource has been exhausted') || errStatus === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      userFriendlyError = 'दर सीमा (Rate limit / 429 Quota) समाप्त हो गई है। कृपया 1 मिनट बाद पुनः प्रयास करें।';
    } else if (errStatus === 404 || errMsg.includes('not found') || errMsg.includes('is not found')) {
      userFriendlyError = 'मॉडल उपलब्ध नहीं है या इस API Key पर सक्षम नहीं है।';
    }

    res.json({
      success: false,
      model,
      error: userFriendlyError,
      rawError: errMsg
    });
  }
});

// API endpoint for evaluating UPSC Mains Copy

// AI PATTERN ANALYSIS FOR LEARNING LOGS
app.post('/api/analyze-learning', async (req, res) => {
  try {
    const { diffData } = req.body;
    if (!diffData || !Array.isArray(diffData) || diffData.length === 0) {
      return res.status(400).json({ error: 'No data provided.' });
    }

    let logsText = '';
    diffData.forEach((log, index) => {
      logsText += `
--- Log ${index + 1} ---
Student: ${log.student}
AI Marks: ${log.ai_marks} -> Human Marks: ${log.human_marks}
AI Comment: ${log.ai_comment}
Human Comment: ${log.human_comment}
`;
    });

    const prompt = `
You are an expert Prompt Engineer for a UPSC Mains AI Evaluation System.
The human evaluator has reviewed several copies previously evaluated by the AI and made corrections.

Here is a log of the corrections made (comparing what AI did vs what Human did):
${logsText}

Task:
Analyze these corrections to find consistent patterns. Why did the human override the AI?
Based on these patterns, suggest 2 to 3 new concise RULES that should be added to the AI's Master Prompt to prevent these AI mistakes in the future.

Format the response strictly as a bulleted list of 2-3 clear, actionable instructions intended to be placed directly into the AI's system prompt.
Keep it strictly in Hindi.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    res.json({ analysis: response.text });
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

function softenExaminerToneText(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return sanitizeAnnotationText(
    normalizeFixedGlossaryTerms(raw)
      .replace(/गंभीर\s+तथ्यात्मक\s+त्रुटि/g, 'तथ्य गलत')
      .replace(/गंभीर\s+त्रुटि/g, 'त्रुटि')
      .replace(/पूर्णतः\s+अस्वीकार्य\s+है|अस्वीकार्य\s+है/g, 'सुधार योग्य है')
      .replace(/(?:लगभग\s*)?~?\s*\d+\s*शब्द(?:ों)?(?:\s*में)?\s*,?\s*/g, '')
      .replace(/आधा\s+पृष्ठ\s+खाली(?:\s+है)?\s*[,।]?\s*/g, '')
      .replace(/[;,]?\s*हालाँकि\s+उत्तर\s+\d+\s+पृष्ठों?\s+में\s+ही\s+समाप्त\s+हो\s+गया[^।.]*[।.]?/g, '।')
      .replace(/उत्तर\s+(?:केवल\s+)?\d+\s+पृष्ठों?\s+में\s+(?:ही\s+)?समाप्त\s+हो\s+गया[^।.]*[।.]?/g, ''),
    'pure_hindi',
    false
  );
}

function sanitizePresentationFormatText(raw?: string): string {
  const base = softenExaminerToneText(raw);
  if (!base) return 'उत्तर में पैराग्राफ एवं बुलेट बिंदुओं का संतुलित प्रयोग किया गया है।';
  const clauses = base
    .split(/(?<=[।.!])\s+|\s*[,;]\s*(?=(?:किंतु|परंतु|जबकि|तथापि)\s+(?:तर्कों|तथ्यों|साक्ष्यों|विश्लेषण)\b)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/(?:तर्कों\s+में\s+गहराई|तर्क\s+में\s+गहराई|विश्लेषणात्मक\s+गहराई\s+की\s+कमी|तथ्यों\s+की\s+कमी|साक्ष्यों\s+का\s+अभाव|विषय-वस्तु\s+सतही)/.test(
          s
        )
    );
  const cleaned = clauses
    .join(' ')
    .replace(/[,;]\s*(?:किंतु|परंतु|लेकिन)\s*तर्कों?\s+में\s+गहराई\s+की\s+कमी\s+है[।.]?/g, '।')
    .replace(/तर्कों\s+में\s+गहराई\s+की\s+कमी(?:\s+दिखती\s+है|\s+है)?/g, 'उप-शीर्षकों का और स्पष्ट विभाजन अपेक्षित है')
    .trim();
  return cleaned.length >= 10
    ? cleaned
    : 'उत्तर में पैराग्राफ एवं बुलेट बिंदुओं का प्रयोग किया गया है; मुख्य कीवर्ड्स को रेखांकित करने और उप-शीर्षक बनाने से प्रस्तुति और निखरेगी।';
}

// ===== अंक-विभाजन सत्यापन: 4 स्वतंत्र स्तंभ (खंड 2 एवं खंड 8 के सार्वभौमिक नियमों के अनुसार) =====
function reconcileMarksV2(data: any, maxMarks: number): string[] {
  const notes: string[] = [];
  const q = (n: number) => Math.round(n * 4) / 4;
  const clamp = (v: any, max: number) => q(Math.max(0, Math.min(max, Number(v) || 0)));

  const cfg =
    maxMarks === 15 ? { intro: 2, concl: 2, pres: 1.5 }
    : maxMarks === 10 ? { intro: 1, concl: 1, pres: 1 }
    : { intro: q(maxMarks * 0.1), concl: q(maxMarks * 0.1), pres: q(maxMarks * 0.1) };
  const contentMax = q(maxMarks - cfg.intro - cfg.concl - cfg.pres);

  const rb = data?.rubric_breakdown;
  if (!rb || !rb.introduction || !rb.conclusion || !rb.main_body) {
    return ['रूब्रिक अधूरा था; अंक मॉडल के कुल पर छोड़े गए।'];
  }

  rb.introduction.max_score = cfg.intro;
  rb.introduction.score = clamp(rb.introduction.score, cfg.intro);
  rb.conclusion.max_score = cfg.concl;
  rb.conclusion.score = clamp(rb.conclusion.score, cfg.concl);

  const mb = rb.main_body;
  const parts: any[] = Array.isArray(mb.parts) ? mb.parts.filter((p: any) => p && typeof p === 'object') : [];
  const content = parts.filter((p) => p.kind !== 'presentation');
  const legacyPresFromParts = parts.find((p) => p.kind === 'presentation');
  let bodyScore: number;

  if (content.length === 0) {
    bodyScore = clamp(mb.score, contentMax);
    notes.push('मुख्य भाग का भाग-वार विभाजन नहीं मिला; मुख्य भाग का कुल अंक ही लिया गया।');
  } else {
    // Section 2.4 Sub-part level ratios:
    // व्यापक 75%+ (0.80) | संतुलित 50% (0.50) | आंशिक 35-40% (0.38) | सतही 20-25% (0.22) | छूटा 0% (0.0)
    const statusWeightMap: Record<string, number> = {
      'व्यापक कवरेज': 0.80,
      'संतुलित कवरेज': 0.50,
      'आंशिक कवरेज': 0.38,
      'सतही कवरेज': 0.22,
      'छूटा हुआ भाग': 0.0
    };

    let weightedRatioSum = 0;
    let superficialOrMissingCount = 0;
    let allBalancedOrBroad = true;

    content.forEach((p) => {
      if (p.part_name) {
        p.part_name = cleanSubpartTitle(p.part_name) || p.part_name;
      }
      if (p.coverage_and_balance) {
        p.coverage_and_balance = softenExaminerToneText(stripDuplicateRubricPrefix(p.coverage_and_balance, 'coverage'));
      }
      if (p.deduction_reason) {
        p.deduction_reason = softenExaminerToneText(stripDuplicateRubricPrefix(String(p.deduction_reason), 'deduction'));
      }

      const rawStatus = String(p.coverage_status || '').trim();
      const legacyScore = Number(p.score) || 0;
      const legacyMax = Number(p.max_score) || (contentMax / content.length);
      const legacyRatio = legacyMax > 0 ? legacyScore / legacyMax : 0;

      let canonicalStatus = 'आंशिक कवरेज';
      if (/छूटा|अनुपस्थित|0/.test(rawStatus)) {
        canonicalStatus = 'छूटा हुआ भाग';
      } else if (/व्यापक|पूर्ण/.test(rawStatus)) {
        canonicalStatus = 'व्यापक कवरेज';
      } else if (/संतुलित/.test(rawStatus)) {
        canonicalStatus = 'संतुलित कवरेज';
      } else if (/सतही|अपर्याप्त/.test(rawStatus)) {
        canonicalStatus = 'सतही कवरेज';
      } else if (/आंशिक/.test(rawStatus)) {
        canonicalStatus = 'आंशिक कवरेज';
      } else if (legacyMax > 0 && p.score !== undefined) {
        canonicalStatus =
          legacyScore === 0
            ? 'छूटा हुआ भाग'
            : legacyRatio >= 0.72
              ? 'व्यापक कवरेज'
              : legacyRatio >= 0.50
                ? 'संतुलित कवरेज'
                : legacyRatio >= 0.30
                  ? 'आंशिक कवरेज'
                  : 'सतही कवरेज';
      }

      // Section 8.8 Self-Check: tag and coverage_status consistency
      // - (आंशिक) or (गलत) or (अप्रासंगिक) tag cannot have संतुलित कवरेज or व्यापक कवरेज
      // - (सही) tag cannot have सतही कवरेज
      const dr = String(p.deduction_reason || '');
      const hasWrongOrIrrelevantTag = /^\s*\((?:गलत|अप्रासंगिक)\)/.test(dr);
      const hasPartialTag = /^\s*\(आंशिक\)/.test(dr) || /तथ्य\s+गलत/.test(dr);
      const hasCorrectTag = /^\s*\(सही\)/.test(dr) && !/तथ्य\s+गलत/.test(dr);

      if (hasWrongOrIrrelevantTag && (canonicalStatus === 'व्यापक कवरेज' || canonicalStatus === 'संतुलित कवरेज' || canonicalStatus === 'आंशिक कवरेज')) {
        canonicalStatus = 'सतही कवरेज';
      } else if (hasPartialTag && (canonicalStatus === 'व्यापक कवरेज' || canonicalStatus === 'संतुलित कवरेज')) {
        canonicalStatus = 'आंशिक कवरेज';
      } else if (hasCorrectTag && canonicalStatus === 'सतही कवरेज') {
        canonicalStatus = 'आंशिक कवरेज';
      }

      if (canonicalStatus === 'सतही कवरेज' || canonicalStatus === 'छूटा हुआ भाग') {
        superficialOrMissingCount++;
      }
      if (canonicalStatus !== 'संतुलित कवरेज' && canonicalStatus !== 'व्यापक कवरेज') {
        allBalancedOrBroad = false;
      }

      p.kind = 'question_part';
      p.coverage_status = canonicalStatus;
      weightedRatioSum += statusWeightMap[canonicalStatus] ?? 0.38;

      // Remove micro-division numeric fields and duplicate legacy fields from sub-parts
      delete p.score;
      delete p.max_score;
      delete p.content_score;
      delete p.content_max;
      delete p.evidence_score;
      delete p.evidence_max;
      delete p.coverage_and_balance;
      delete p.feedback;
    });

    const avgPartRatio = content.length > 0 ? weightedRatioSum / content.length : 0.38;
    const statusAnchoredBodyScore = clamp(contentMax * avgPartRatio, contentMax);
    const rawModelBodyScore = clamp(mb.score, contentMax);

    let contentScore = rawModelBodyScore > 0
      ? clamp((rawModelBodyScore + statusAnchoredBodyScore) / 2, contentMax)
      : statusAnchoredBodyScore;

    // Section 2.4 Caps:
    // 1. आधे या अधिक उप-भाग सतही/छूटे हों तो 10M में 1.75 (15M में 2.50) से अधिक नहीं।
    if (content.length > 0 && superficialOrMissingCount >= content.length / 2) {
      const halfSuperficialCap = maxMarks === 10 ? 1.75 : maxMarks === 15 ? 2.50 : q(contentMax * 0.25);
      contentScore = Math.min(contentScore, halfSuperficialCap);
    }

    // 2. 10M में 4.50+ तभी जब सभी उप-भाग संतुलित या व्यापक हों।
    if (!allBalancedOrBroad) {
      const nonBalancedCap = maxMarks === 10 ? 4.25 : maxMarks === 15 ? 5.75 : q(contentMax * 0.60);
      contentScore = Math.min(contentScore, nonBalancedCap);
    }

    if (data.question_analysis?.core_demand_met === false && avgPartRatio >= 0.25) {
      data.question_analysis.core_demand_met = true;
    }

    if (data.question_analysis?.core_demand_met === false) {
      contentScore = Math.min(contentScore, q(contentMax * 0.35));
    }

    mb.parts = content;
    bodyScore = contentScore;
  }

  mb.score = bodyScore;
  mb.max_score = contentMax;

  // Section 4.G: matched_points: अधिकतम 2, केवल 100% सत्यापित और सही उप-शीर्षक के।
  if (Array.isArray(mb.matched_points)) {
    mb.matched_points = mb.matched_points
      .map((pt: string) => softenExaminerToneText(cleanComparisonPoint(String(pt || ''), content)))
      .filter((pt: string) => Boolean(pt && pt.trim().length > 0))
      .slice(0, 2);
  }

  // Section 4.F: missing_points: ठीक 3 सुधार, अंक सबसे ज़्यादा बढ़ाने के क्रम में
  if (Array.isArray(mb.missing_points)) {
    mb.missing_points = mb.missing_points
      .map((pt: string) => softenExaminerToneText(cleanComparisonPoint(String(pt || ''), content)))
      .filter((pt: string) => Boolean(pt && pt.trim().length > 0))
      .slice(0, 3);
  }

  if (rb.introduction) {
    if (rb.introduction.strengths) rb.introduction.strengths = softenExaminerToneText(stripDuplicateRubricPrefix(rb.introduction.strengths, 'strengths'));
    if (rb.introduction.improvements) rb.introduction.improvements = softenExaminerToneText(stripDuplicateRubricPrefix(rb.introduction.improvements, 'improvements'));
    if (rb.introduction.ideal_approach) rb.introduction.ideal_approach = softenExaminerToneText(stripDuplicateRubricPrefix(rb.introduction.ideal_approach, 'ideal'));
  }

  if (rb.conclusion) {
    if (rb.conclusion.strengths) rb.conclusion.strengths = softenExaminerToneText(stripDuplicateRubricPrefix(rb.conclusion.strengths, 'strengths'));
    if (rb.conclusion.improvements) rb.conclusion.improvements = softenExaminerToneText(stripDuplicateRubricPrefix(rb.conclusion.improvements, 'improvements'));
    if (rb.conclusion.ideal_approach) rb.conclusion.ideal_approach = softenExaminerToneText(stripDuplicateRubricPrefix(rb.conclusion.ideal_approach, 'ideal'));
  }

  // 3rd Pillar: Presentation (स्तंभ 3 — प्रस्तुतीकरण: केवल दिखने वाली संरचना और सुपाठ्यता)
  const ratio = contentMax > 0 ? bodyScore / contentMax : 0.5;
  if (!rb.presentation || typeof rb.presentation !== 'object') {
    if (legacyPresFromParts) {
      rb.presentation = {
        score: clamp(legacyPresFromParts.score, cfg.pres),
        max_score: cfg.pres,
        format_and_flow: sanitizePresentationFormatText(stripDuplicateRubricPrefix(legacyPresFromParts.coverage_and_balance || mb.presentation_feedback || 'उत्तर में पैराग्राफ एवं बुलेट बिंदुओं का प्रयोग किया गया है।', 'format')),
        diagram_scope: legacyPresFromParts.deduction_reason ? softenExaminerToneText(stripDuplicateRubricPrefix(legacyPresFromParts.deduction_reason, 'diagram')) : '',
        legibility_and_spacing: 'हस्तलेखन स्पष्ट एवं पठनीय है।'
      };
    } else {
      rb.presentation = {
        score: q(cfg.pres * ratio),
        max_score: cfg.pres,
        format_and_flow: sanitizePresentationFormatText(stripDuplicateRubricPrefix(mb.presentation_feedback || 'उत्तर में पैराग्राफ एवं बुलेट बिंदुओं का प्रयोग किया गया है।', 'format')),
        diagram_scope: '',
        legibility_and_spacing: 'हस्तलेखन स्पष्ट एवं पठनीय है।'
      };
      notes.push('प्रस्तुतीकरण का अंक मॉडल ने अलग से नहीं दिया; विषय-वस्तु के अनुपात में जोड़ा गया।');
    }
  } else {
    rb.presentation.max_score = cfg.pres;
    rb.presentation.score = clamp(rb.presentation.score, cfg.pres);
    rb.presentation.format_and_flow = sanitizePresentationFormatText(
      stripDuplicateRubricPrefix(
        rb.presentation.format_and_flow || mb.presentation_feedback || 'उत्तर में पैराग्राफ एवं बुलेट बिंदुओं का संतुलित प्रयोग किया गया है।',
        'format'
      )
    );
    // Section 5.2: कारण या सूची वाले प्रश्न में diagram_scope खाली '' रहे।
    const rawDiagramScope = typeof rb.presentation.diagram_scope === 'string' ? rb.presentation.diagram_scope.trim() : '';
    rb.presentation.diagram_scope = rawDiagramScope
      ? softenExaminerToneText(stripDuplicateRubricPrefix(rawDiagramScope, 'diagram'))
      : '';
    rb.presentation.legibility_and_spacing = softenExaminerToneText(
      stripDuplicateRubricPrefix(
        rb.presentation.legibility_and_spacing || 'हस्तलेखन स्पष्ट एवं पठनीय है।',
        'legibility'
      )
    );
  }

  if (data?.question_analysis?.core_demand_note) {
    data.question_analysis.core_demand_note = softenExaminerToneText(String(data.question_analysis.core_demand_note));
  }

  const total = q(Math.min(maxMarks, rb.introduction.score + bodyScore + rb.presentation.score + rb.conclusion.score));
  if (data.total_marks) {
    const modelTotal = Number(data.total_marks.obtained);
    if (isNaN(modelTotal) || Math.abs(modelTotal - total) > 0.01) {
      notes.push(`कुल अंक चारों स्तंभों के योग (${total}) से मिलाए गए; मॉडल का कुल ${isNaN(modelTotal) ? 'अनुपलब्ध' : modelTotal} था।`);
    }
    data.total_marks.obtained = total;
  }
  return notes;
}

app.post('/api/evaluate', async (req, res) => {
  try {
    const { 
      images, 
      subject, 
      question, 
      maxMarks, 
      modelAnswer, 
      rubricRules, 
      systemPrompt, 
      slotId,
      slotName,
      requestedModels,
      evaluationStrictness,
      feedbackDetailLevel,
      valueAdditionFocus,
      ocrSensitivity,
      feedbackLanguage,
      temperature: customTemperature,
      maxOutputTokens: customMaxTokens,
      thinkingLevel: customThinkingLevel
    } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one page image.' });
    }

    const selectedSubject = subject || 'GS-1';
    const selectedMaxMarks = parseFloat(maxMarks) || 10;
    const questionText = question ? question.trim() : '';

    // Execute the active prompt slot (Slot 1 universal prompt by default)
    const activeSlotIdToUse = slotId !== undefined ? Number(slotId) : currentSlotId;
    const activeSlotNameToUse = slotName || currentSlotName || `Slot ${activeSlotIdToUse}`;

    let masterSystemPrompt = typeof systemPrompt === 'string' && systemPrompt.trim() !== ''
      ? systemPrompt.trim()
      : (currentSystemPrompt || defaultSystemPrompt || '');

    const preferredModel = (Array.isArray(requestedModels) && requestedModels.length > 0) ? requestedModels[0] : 'gemini-4-hydrogen';
    const effectiveTemperature = (typeof customTemperature === 'number' && !isNaN(customTemperature))
      ? Math.max(0.0, Math.min(1.0, customTemperature))
      : 0.1;

    const effectiveMaxTokens = (typeof customMaxTokens === 'number' && !isNaN(customMaxTokens))
      ? Math.max(2000, Math.min(8192, Math.round(customMaxTokens)))
      : 8192;

    const effectiveThinkingLevel: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto' =
      (customThinkingLevel === 'minimal' ||
        customThinkingLevel === 'low' ||
        customThinkingLevel === 'medium' ||
        customThinkingLevel === 'high' ||
        customThinkingLevel === 'xhigh' ||
        customThinkingLevel === 'auto')
        ? customThinkingLevel
        : 'auto';

    console.log(`[AI Evaluation] Slot: ${activeSlotIdToUse} ("${activeSlotNameToUse}") | Thinking: ${effectiveThinkingLevel.toUpperCase()} | Target Output Tokens: ${effectiveMaxTokens}`);

    if (!masterSystemPrompt) {
      return res.status(400).json({ error: 'चयनित प्रॉम्प्ट स्लॉट खाली है। कृपया स्लॉट में प्रॉम्प्ट दर्ज करें अथवा एक वैध स्लॉट चुनें।' });
    }

    // Assemble the complete universal prompt with session context
    const supremeSystemInstruction = buildModularPrompt({
      customSlotPrompt: masterSystemPrompt,
      subject: selectedSubject,
      maxMarks: selectedMaxMarks,
      questionText: questionText,
      modelAnswer: modelAnswer,
      rubricRules: rubricRules,
      evaluationStrictness,
      feedbackDetailLevel,
      valueAdditionFocus,
      ocrSensitivity,
      feedbackLanguage,
      maxOutputTokens: effectiveMaxTokens,
      thinkingLevel: effectiveThinkingLevel
    });

    // Construct the parts array for Gemini with clear page context
    const contentsParts = [];

    contentsParts.push({
      text: `[उत्तर-पुस्तिका मूल्यांकन अनुरोध — डिफ़ॉल्ट पूर्णांक: ${selectedMaxMarks} अंक]`
    });

    // Add each uploaded page as inlineData part with explicit page index labeling
    images.forEach((base64DataUrl, index) => {
      const pageIndex = index + 1;
      contentsParts.push({
        text: `[पृष्ठ ${pageIndex}]`
      });

      // Extract pure base64 from data URI
      const base64Regex = /^data:(image\/\w+);base64,(.+)$/;
      const matches = base64DataUrl.match(base64Regex);
      if (matches && matches.length === 3) {
        contentsParts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2]
          }
        });
      } else {
        console.error(`Invalid image format at index ${index}`);
      }
    });

    // Note: Gemini counts thinking_tokens inside maxOutputTokens.
    // Add dedicated thinking headroom so thinking tokens NEVER reduce the JSON completion token budget!
    const thinkingHeadroom =
      effectiveThinkingLevel === 'minimal'
        ? 400
        : effectiveThinkingLevel === 'low'
          ? 600
          : effectiveThinkingLevel === 'medium'
            ? 1600
            : effectiveThinkingLevel === 'high'
              ? 3800
              : effectiveThinkingLevel === 'xhigh'
                ? 5500
                : 2600;
    const sdkMaxOutputTokens = Math.min(16384, effectiveMaxTokens + thinkingHeadroom);

    const generationConfig: any = {
      systemInstruction: supremeSystemInstruction,
      temperature: effectiveTemperature,
      topP: 0.1,
      maxOutputTokens: sdkMaxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          total_marks: {
            type: Type.OBJECT,
            properties: {
              obtained: { type: Type.NUMBER },
              max_marks: { type: Type.NUMBER }
            },
            required: ["obtained", "max_marks"]
          },
          question_analysis: {
            type: Type.OBJECT,
            properties: {
              question_detected: { type: Type.STRING },
              detected_subject: { type: Type.STRING },
              directive_word: { type: Type.STRING },
              core_demand_met: { type: Type.BOOLEAN },
              core_demand_note: { type: Type.STRING }
            },
            required: ["question_detected", "detected_subject", "directive_word", "core_demand_met", "core_demand_note"]
          },
          rubric_breakdown: {
            type: Type.OBJECT,
            properties: {
              introduction: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  strengths: { type: Type.STRING },
                  improvements: { type: Type.STRING },
                  ideal_approach: { type: Type.STRING }
                },
                required: ["score", "strengths", "improvements", "ideal_approach"]
              },
              main_body: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  parts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        part_name: { type: Type.STRING },
                        coverage_status: { type: Type.STRING },
                        deduction_reason: { type: Type.STRING }
                      },
                      required: ["part_name", "coverage_status", "deduction_reason"]
                    }
                  },
                  missing_points: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  matched_points: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["score", "parts", "missing_points", "matched_points"]
              },
              presentation: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  format_and_flow: { type: Type.STRING },
                  diagram_scope: { type: Type.STRING },
                  legibility_and_spacing: { type: Type.STRING }
                },
                required: ["score", "format_and_flow", "diagram_scope", "legibility_and_spacing"]
              },
              conclusion: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  strengths: { type: Type.STRING },
                  improvements: { type: Type.STRING },
                  ideal_approach: { type: Type.STRING }
                },
                required: ["score", "strengths", "improvements", "ideal_approach"]
              }
            },
            required: ["introduction", "main_body", "presentation", "conclusion"]
          },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                page_number: { type: Type.INTEGER },
                page_type: { type: Type.STRING },
                annotations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      x_percent: { type: Type.NUMBER },
                      y_percent: { type: Type.NUMBER },
                      text: { type: Type.STRING }
                    },
                    required: ["x_percent", "y_percent", "text"]
                  }
                }
              },
              required: ["page_number", "page_type", "annotations"]
            }
          }
        },
        required: ["total_marks", "question_analysis", "rubric_breakdown", "pages"]
      }
    };

    // Apply exact user-selected ThinkingLevel from Model Settings:
    // - 'minimal': ThinkingLevel.MINIMAL (Mapped safely to LOW on Gemini 4 models)
    // - 'low': ThinkingLevel.LOW (Token Saver: ~300-500 thinking tokens)
    // - 'medium': ThinkingLevel.MEDIUM (Balanced: ~1,000-1,500 thinking tokens)
    // - 'high': ThinkingLevel.HIGH (Deep Analytical: ~2,200-3,500+ thinking tokens)
    // - 'xhigh': ThinkingLevel.XHIGH (Max Reasoning Depth on gemini-4-hydrogen: ~4,000+ thinking tokens)
    // - 'auto': Let the model dynamically allocate full natural reasoning
    if (effectiveThinkingLevel === 'minimal') {
      generationConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
    } else if (effectiveThinkingLevel === 'low') {
      generationConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    } else if (effectiveThinkingLevel === 'medium') {
      generationConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
    } else if (effectiveThinkingLevel === 'high') {
      generationConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (effectiveThinkingLevel === 'xhigh') {
      generationConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.XHIGH };
    }

    const response = await generateContentWithRetry(ai, {
      model: preferredModel,
      requestedModels,
      contents: { parts: contentsParts },
      config: generationConfig
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini API.');
    }

    // Parse the JSON returned by Gemini safely with automated repair
    const evaluationData = safeParseJson(resultText);

    // Support automatic detection of handwritten/printed question marks with fallback to selectedMaxMarks
    const validUpscMaxMarks = [10, 12.5, 15, 20, 25, 50, 125, 250];
    const rawDetected = Number(evaluationData.total_marks?.detected_max_marks || evaluationData.total_marks?.max_marks);
    const hasValidDetected = !isNaN(rawDetected) && validUpscMaxMarks.includes(rawDetected);
    const effectiveMaxMarks = hasValidDetected ? rawDetected : selectedMaxMarks;

    if (!evaluationData.total_marks) {
      evaluationData.total_marks = { obtained: 0, max_marks: effectiveMaxMarks };
    }
    evaluationData.total_marks.max_marks = effectiveMaxMarks;
    evaluationData.total_marks.detected_marks = hasValidDetected ? rawDetected : undefined;
    evaluationData.total_marks.marks_detection_source = hasValidDetected ? 'self_detected' : 'settings_fallback';
    evaluationData.total_marks.marks_detection_evidence = hasValidDetected
      ? `कॉपी से स्वतः पहचाना गया पूर्णांक: ${rawDetected} अंक`
      : `चयनित पूर्णांक: ${selectedMaxMarks} अंक`;
    evaluationData.total_marks.setting_marks = selectedMaxMarks;

    if (evaluationData.total_marks.obtained > effectiveMaxMarks) {
      evaluationData.total_marks.obtained = effectiveMaxMarks;
    }

    // Ensure evaluationData.pages is ALWAYS a valid array of pages
    if (!Array.isArray(evaluationData.pages) || evaluationData.pages.length === 0) {
      evaluationData.pages = images.map((_, idx) => ({
        page_number: idx + 1,
        page_type: idx === 0 ? 'cover_page' : 'answer_page',
        annotations: []
      }));
    }

    if (evaluationData.pages && Array.isArray(evaluationData.pages)) {
      evaluationData.pages.forEach((p: any) => {
        if (p.page_type === 'answer_content') {
          p.page_type = 'answer_page';
        } else if (p.page_type === 'blank_or_Test') {
          p.page_type = 'blank_page';
        }
        delete p.page_word_count;
      });
    }

    // Word count removed per user requirement (no word count guesswork on copy or report)
    delete evaluationData.word_count;

    const marksNotes = reconcileMarksV2(evaluationData, effectiveMaxMarks);
    if (marksNotes.length) evaluationData.marks_notes = marksNotes;

    // RESPECT USER PROMPT & GENUINE AI EVALUATION:
    // No hardcoded or fake annotations are injected. 
    // The exact annotations provided by the AI based on the user's prompt are retained 100% authentically.
    if (evaluationData.pages && Array.isArray(evaluationData.pages)) {
      const langMode =
        feedbackLanguage === 'english' || feedbackLanguage === 'bilingual'
          ? feedbackLanguage
          : 'pure_hindi';
      evaluationData.pages.forEach((p: any, pIdx: number) => {
        if (!p.annotations || !Array.isArray(p.annotations)) {
          p.annotations = [];
        }

        // Point 7: Cover Page Zero-Comment Rule
        // If a page is a pure cover page or blank page (or Page 1 summary indicates only candidate info / printed question), strip all margin comments
        const summaryStr = String(p.detected_content_summary || '');
        const isPureCoverSummary =
          pIdx === 0 &&
          (/(?:केवल\s*प्रश्न|केवल\s*उम्मीदवार|कोई\s*उत्तर\s*नहीं|उत्तर\s*नहीं\s*लिखा|cover\s*page|printed\s*question\s*only|उत्तर\s*पृष्ठ\s*2)/i.test(summaryStr) ||
            p.page_type === 'cover_page');

        if (p.page_type === 'blank_page' || isPureCoverSummary) {
          if (isPureCoverSummary) p.page_type = 'cover_page';
          p.annotations = [];
          return;
        }

        const validAnns = p.annotations.filter(
          (ann: any) => ann && typeof ann.text === 'string' && ann.text.trim().length > 0
        );
        p.annotations = deduplicateAndDiversifyPageAnnotations(validAnns, langMode);
      });
    }

    // Attach evaluation model, fallback details, applied slot, and per-model token usage telemetry
    const winningModel = (response as any).modelUsed || 'gemini-4-hydrogen';
    const primaryRequested = (response as any).primaryModelRequested || (Array.isArray(requestedModels) && requestedModels[0]) || 'gemini-4-hydrogen';
    const executionHistory = (response as any).executionHistory || [];
    const fallbackOccurred = Boolean((response as any).fallbackOccurred || (winningModel !== primaryRequested) || (executionHistory.length > 1));
    const failedPrimaryAttempt = executionHistory.find((h: any) => h.status !== 'success');
    const fallbackReason = fallbackOccurred && failedPrimaryAttempt
      ? `${failedPrimaryAttempt.model}: ${failedPrimaryAttempt.status} (${failedPrimaryAttempt.status_code || ''}) - ${failedPrimaryAttempt.error_message || ''}`
      : undefined;

    if (fallbackOccurred) {
      console.log(`[AI Telemetry] Fallback occurred: ${primaryRequested} -> ${winningModel} | Reason: ${fallbackReason || 'Retry'} `);
    }

    evaluationData.model_used = winningModel;
    evaluationData.primary_model_requested = primaryRequested;
    evaluationData.fallback_occurred = fallbackOccurred;
    if (fallbackReason) evaluationData.fallback_reason = fallbackReason;
    evaluationData.thinking_level_used = effectiveThinkingLevel;
    evaluationData.model_execution_history = executionHistory;
    evaluationData.applied_slot = {
      id: activeSlotIdToUse,
      name: activeSlotNameToUse
    };

    // Calculate cumulative token usage across all attempts (including cached & thinking tokens)
    let cumulativePromptTokens = 0;
    let cumulativeCachedTokens = 0;
    let cumulativeThinkingTokens = 0;
    let cumulativeCompletionTokens = 0;
    let cumulativeTotalTokens = 0;

    if (Array.isArray(executionHistory) && executionHistory.length > 0) {
      executionHistory.forEach((hist: any) => {
        if (hist.tokens) {
          cumulativePromptTokens += hist.tokens.prompt_tokens || 0;
          cumulativeCachedTokens += hist.tokens.cached_tokens || 0;
          cumulativeThinkingTokens += hist.tokens.thinking_tokens || 0;
          cumulativeCompletionTokens += hist.tokens.completion_tokens || 0;
          cumulativeTotalTokens += hist.tokens.total_tokens || 0;
        }
      });
    }

    // Fallback if metadata was not populated directly on history item
    if (cumulativeTotalTokens === 0) {
      if (response.usageMetadata) {
        cumulativePromptTokens = response.usageMetadata.promptTokenCount || 0;
        cumulativeCachedTokens = (response.usageMetadata as any).cachedContentTokenCount || 0;
        cumulativeCompletionTokens = response.usageMetadata.candidatesTokenCount || 0;
        cumulativeTotalTokens = response.usageMetadata.totalTokenCount || (
          (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0)
        );
        cumulativeThinkingTokens = (response.usageMetadata as any).thoughtsTokenCount || Math.max(0, cumulativeTotalTokens - (cumulativePromptTokens + cumulativeCompletionTokens));
      } else {
        const estimatedPrompt = Math.round((resultText.length * 3) / 4) + 1200;
        const estimatedCompletion = Math.round(resultText.length / 4);
        cumulativePromptTokens = estimatedPrompt;
        cumulativeCompletionTokens = estimatedCompletion;
        cumulativeTotalTokens = estimatedPrompt + estimatedCompletion;
      }
    }

    // Estimate static prefix tokens (systemInstruction + schema + static request instructions) vs image tokens
    // High-resolution scanned copy pages use ~1,032-1,090 tokens per page (258 base + 3x 258 tiles)
    const estimatedImageTokens = Math.min(
      Math.max(258 * images.length, Math.round(images.length * 1090)),
      Math.max(0, cumulativePromptTokens - 1200)
    );
    const estimatedStaticPrefixTokens = Math.max(0, cumulativePromptTokens - estimatedImageTokens);
    const tokensSavedByCache = Math.round(cumulativeCachedTokens * 0.75);
    const effectiveBillableTokens = Math.max(0, cumulativeTotalTokens - tokensSavedByCache);
    const cacheHitPercent = cumulativePromptTokens > 0
      ? Math.round((cumulativeCachedTokens / cumulativePromptTokens) * 100)
      : 0;

    // Ensure the successful attempt in execution history reflects accurate token counts
    const winningAttempt = executionHistory.find((h: any) => h.status === 'success');
    if (winningAttempt && (!winningAttempt.tokens || winningAttempt.tokens.total_tokens === 0)) {
      winningAttempt.tokens = {
        prompt_tokens: cumulativePromptTokens,
        cached_tokens: cumulativeCachedTokens,
        thinking_tokens: cumulativeThinkingTokens,
        completion_tokens: cumulativeCompletionTokens,
        total_tokens: cumulativeTotalTokens
      };
    }

    evaluationData.token_usage = {
      prompt_tokens: cumulativePromptTokens,
      cached_tokens: cumulativeCachedTokens,
      thinking_tokens: cumulativeThinkingTokens,
      completion_tokens: cumulativeCompletionTokens,
      total_tokens: cumulativeTotalTokens,
      static_prefix_tokens: estimatedStaticPrefixTokens,
      image_tokens: estimatedImageTokens,
      tokens_saved: tokensSavedByCache,
      effective_billable_tokens: effectiveBillableTokens,
      cache_hit_percent: cacheHitPercent
    };

    res.json(evaluationData);

  } catch (error) {
    console.error('Error during UPSC Mains Evaluation:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during AI evaluation.' });
  }
});

// EXTRACT TEXT API (OCR for Model Answers / Questions)
app.post('/api/extract-text', async (req, res) => {
  try {
    const { image, fileDataUrl, mimeType } = req.body;
    const dataUrl = fileDataUrl || image;
    
    if (!dataUrl) {
      return res.status(400).json({ error: 'Please provide a fileDataUrl or image data URL.' });
    }

    const contentsParts = [];
    contentsParts.push({ text: 'Extract and return all the text from this file accurately exactly as it is. If it is a question paper or a model answer, keep its structure intact. Do not add any conversational text. Just output the raw text.' });

    let finalMimeType = mimeType;
    let base64Data = '';
    
    // Process Data URL
    const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
    if (match && match.length === 3) {
      finalMimeType = mimeType || match[1] || 'application/pdf';
      base64Data = match[2];
    } else {
      // maybe it's just raw base64 without prefix
      base64Data = dataUrl;
      finalMimeType = mimeType || 'application/pdf';
    }

    contentsParts.push({
      inlineData: { mimeType: finalMimeType, data: base64Data }
    });

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-4-hydrogen',
      contents: [ { role: 'user', parts: contentsParts } ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    const resultText = response.text;
    res.json({ text: resultText?.trim() || '' });
  } catch (error: any) {
    console.error('Error during Text Extraction:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during extraction.' });
  }
});

// MULTIPLE COPIES BATCH CHECKING FUNCTION API
app.post('/api/evaluate-batch', async (req, res) => {
  try {
    const { studentCopies, systemPrompt, modelAnswerText } = req.body;
    
    if (!studentCopies || !Array.isArray(studentCopies) || studentCopies.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of student copies.' });
    }

    const MAX_BATCH = 50;
    if (studentCopies.length > MAX_BATCH) {
      return res.status(400).json({ error: `अधिकतम ${MAX_BATCH} कॉपियाँ एक साथ सबमिट करें।` });
    }

    const batchResults = [];

    for (const copy of studentCopies) {
      console.log(`Checking copy for Student: ${copy.studentName} (${copy.studentId})...`);

      const contentsParts = [];
      const fallbackMarks = copy.maxMarks || 10;
      const userPrompt = `
<REFERENCE_MODEL_ANSWER>
${modelAnswerText || 'उत्तर-पुस्तिका का दिए गए सिस्टम प्रॉम्प्ट के अनुसार मूल्यांकन करें।'}
</REFERENCE_MODEL_ANSWER>

छात्र ID: ${copy.studentId}
अधिकतम अंक डिफ़ॉल्ट: ${fallbackMarks} अंक

निर्देश: दिए गए सिस्टम प्रॉम्प्ट (System Prompt) के अनुसार इस उत्तर-पुस्तिका का मूल्यांकन करें और JSON स्कीमा में परिणाम दें।`;
      
      contentsParts.push({ text: userPrompt });

      // Add student images
      if (copy.images && Array.isArray(copy.images)) {
        copy.images.forEach((base64DataUrl: string, index: number) => {
          const base64Regex = /^data:(image\/\w+);base64,(.+)$/;
          const matches = base64DataUrl.match(base64Regex);
          if (matches && matches.length === 3) {
            contentsParts.push({
              inlineData: { mimeType: matches[1], data: matches[2] }
            });
          }
        });
      }

      try {
        const batchSystemInstruction = `[CRITICAL MANDATE: STRICT FIDELITY TO SELECTED PROMPT SLOT]
You are a senior UPSC Civil Services evaluator.
You MUST strictly execute the evaluation according to the following instructions:
${systemPrompt || currentSystemPrompt || 'Evaluate using standard UPSC rubrics.'}`;

        const response = await generateContentWithRetry(ai, {
          model: 'gemini-4-hydrogen',
          contents: { parts: contentsParts },
          config: {
            systemInstruction: batchSystemInstruction,
            responseMimeType: 'application/json',
            maxOutputTokens: 2500, // Minimal token budget: only copy annotations and marks
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                obtained_marks: { type: Type.NUMBER },
                max_marks: { type: Type.NUMBER },
                annotations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      page_index: { type: Type.INTEGER },
                      x_percent: { type: Type.NUMBER },
                      y_percent: { type: Type.NUMBER },
                      comment: { type: Type.STRING }
                    },
                    required: ["page_index", "x_percent", "y_percent", "comment"]
                  }
                }
              },
              required: ["obtained_marks", "max_marks", "annotations"]
            }
          }
        });

        const resultText = response.text;
        if (!resultText) throw new Error('Empty response from API');

        const parsedResult = safeParseJson(resultText);
        parsedResult.max_marks = fallbackMarks;
        parsedResult.obtained_marks = Math.min(fallbackMarks, Number(parsedResult.obtained_marks) || 0);
        parsedResult.marks_detection_source = 'settings_fallback';
        parsedResult.marks_detection_evidence = `चयनित निश्चित पूर्णांक लॉक: ${fallbackMarks} अंक`;
        parsedResult.model_used = (response as any).modelUsed || 'gemini-4-hydrogen';
        if (response.usageMetadata) {
          parsedResult.token_usage = {
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata.totalTokenCount || 0
          };
        }

        batchResults.push({
          studentId: copy.studentId,
          studentName: copy.studentName,
          status: "SUCCESS",
          result: parsedResult
        });
      } catch (error: any) {
        batchResults.push({
          studentId: copy.studentId,
          studentName: copy.studentName,
          status: "FAILED",
          error: error.message || 'Unknown error'
        });
      }
    }

    res.json(batchResults);
  } catch (error: any) {
    console.error('Error during Batch Evaluation:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during batch evaluation.' });
  }
});

// Integrate Vite middleware in development or serve static build in production
async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
