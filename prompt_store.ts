import fs from 'fs';
import path from 'path';
import { MASTER_8_BLOCK_PROMPT } from './src/defaultPrompt';

const CACHE_FILE = path.join(process.cwd(), '.prompt_cache.json');

export const defaultSystemPrompt = MASTER_8_BLOCK_PROMPT;
export let currentSystemPrompt = defaultSystemPrompt;
export let currentSlotId = 1;
export let currentSlotName = 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)';

// Load persisted prompt slot on server boot if available, ensuring Slot 1 universal prompt is active by default
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.prompt === 'string' &&
      parsed.prompt.trim().length > 100 &&
      parsed.prompt.includes('### 1. सार्वभौमिक नियम')
    ) {
      currentSystemPrompt = parsed.prompt.replace(/^Second prompt,naam niyam\s*\nV2\(4\)\s*\n/i, '').trim();
      currentSlotId = typeof parsed.slotId === 'number' ? parsed.slotId : 1;
      currentSlotName = parsed.slotName && !parsed.slotName.includes('खाली')
        ? parsed.slotName
        : 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)';
    } else {
      currentSystemPrompt = defaultSystemPrompt;
      currentSlotId = 1;
      currentSlotName = 'Slot 1 (मुख्य सार्वभौमिक प्रॉम्प्ट V2.4)';
    }
  }
} catch (err) {
  console.warn('[PromptStore] Could not read persisted prompt cache, using default:', err);
}

export function updateSystemPrompt(newPrompt: string, slotId?: number, slotName?: string) {
  currentSystemPrompt = newPrompt;
  if (slotId !== undefined) currentSlotId = slotId;
  if (slotName !== undefined) currentSlotName = slotName;
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        prompt: currentSystemPrompt,
        slotId: currentSlotId,
        slotName: currentSlotName,
        updatedAt: new Date().toISOString()
      }, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.warn('[PromptStore] Failed to persist prompt cache:', err);
  }
}
