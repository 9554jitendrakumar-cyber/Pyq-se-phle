export type EvaluationThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';

export interface ThinkingLevelOption {
  level: EvaluationThinkingLevel;
  shortLabel: string;
  label: string;
  badgeText: string;
  sub: string;
  tokenEstimate: string;
}

export const THINKING_LEVEL_OPTIONS: ThinkingLevelOption[] = [
  {
    level: 'minimal',
    shortLabel: '⚡ Minimal',
    label: '⚡ Minimal (न्यूनतम)',
    badgeText: '⚡ Minimal (न्यूनतम थिंकिंग • सुपरफास्ट)',
    sub: '~0–200 Think टोकन • सबसे तेज़',
    tokenEstimate: '~0–200'
  },
  {
    level: 'low',
    shortLabel: '🔹 Low',
    label: '🔹 Low (टोकन सेवर)',
    badgeText: '🔹 Low (टोकन सेवर: ~400 Think टोकन)',
    sub: '~300–500 Think टोकन • तेज़',
    tokenEstimate: '~400'
  },
  {
    level: 'medium',
    shortLabel: '⚖️ Medium',
    label: '⚖️ Medium (संतुलित)',
    badgeText: '⚖️ Medium (संतुलित तर्क: ~1,200 Think टोकन)',
    sub: '~1,000–1,500 Think टोकन • संतुलित',
    tokenEstimate: '~1,200'
  },
  {
    level: 'high',
    shortLabel: '🔬 High',
    label: '🔬 High (गहन तर्क)',
    badgeText: '🔬 High (गहन विश्लेषणात्मक: ~2,500 Think टोकन)',
    sub: '~2,200–3,500 Think टोकन • गहन',
    tokenEstimate: '~2,500+'
  },
  {
    level: 'xhigh',
    shortLabel: '🚀 XHigh',
    label: '🚀 XHigh (सर्वोच्च गहन)',
    badgeText: '🚀 XHigh (अधिकतम गहराई • Gen-4 Hydrogen)',
    sub: '~4,000+ Think टोकन • अधिकतम गहराई',
    tokenEstimate: '~4,000+'
  },
  {
    level: 'auto',
    shortLabel: '✨ Auto',
    label: '✨ Auto (स्वचालित)',
    badgeText: '✨ Auto (पूर्ण प्राकृतिक थिंकिंग)',
    sub: 'मॉडल प्रश्न अनुसार स्वतः तय करेगा',
    tokenEstimate: 'Auto'
  }
];

export function isValidThinkingLevel(val: unknown): val is EvaluationThinkingLevel {
  return (
    val === 'minimal' ||
    val === 'low' ||
    val === 'medium' ||
    val === 'high' ||
    val === 'xhigh' ||
    val === 'auto'
  );
}

export function getThinkingLevelInfo(level?: string): ThinkingLevelOption {
  const found = THINKING_LEVEL_OPTIONS.find((o) => o.level === level);
  return found || THINKING_LEVEL_OPTIONS.find((o) => o.level === 'auto')!;
}

export interface AIModelOption {
  id: string;
  label: string;
  category: 'flash' | 'pro';
  tag: string;
  tagColor: string;
  desc: string;
  tier: 'free' | 'pro_required';
  tierLabel: string;
  speedRating: string;
  reasoningRating: string;
  badge: string;
}

export const ALL_GEMINI_MODELS: AIModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    category: 'flash',
    tag: 'Gen-4 फ्लैगशिप (डिफ़ॉल्ट)',
    tagColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    desc: 'गूगल का नवीनतम चौथी पीढ़ी (Gen-4) का हाइड्रोजन मॉडल। देवनागरी हस्तलेखन पठन (OCR), 4-स्तंभीय रूब्रिक विश्लेषण और सटीक मार्जिन टिप्पणियों के लिए सर्वश्रेष्ठ। सभी थिंकिंग स्तर (Low, Medium, High, XHigh) समर्थित।',
    tier: 'free',
    tierLabel: 'Free Tier / Standard',
    speedRating: '⚡⚡⚡⚡⚡ (सुपरफास्ट)',
    reasoningRating: '🧠🧠🧠🧠🧠 (सर्वोच्च)',
    badge: 'Gen-4 Primary'
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    category: 'flash',
    tag: 'हाई-स्पीड बैकअप',
    tagColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-300 dark:border-teal-800',
    desc: 'उच्च गति और स्थिर प्रदर्शन के लिए विश्वसनीय सेकेंडरी फॉलबैक मॉडल। (Low, Medium, High थिंकिंग स्तर समर्थित)',
    tier: 'free',
    tierLabel: 'Free Tier / Fallback',
    speedRating: '⚡⚡⚡⚡⚡ (तेज़)',
    reasoningRating: '🧠🧠🧠🧠 (उत्कृष्ट)',
    badge: 'Fallback'
  }
];

export const DEFAULT_MODELS_CASCADE = ['gemini-4-hydrogen', 'gemini-3.8-flash'];

export function getModelInfo(id: string): AIModelOption | undefined {
  return ALL_GEMINI_MODELS.find(m => m.id === id);
}
