import { MASTER_8_BLOCK_PROMPT } from './defaultPrompt';

export interface PromptPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  content: string;
}

export interface RuleSnippet {
  id: string;
  category: 'citations' | 'strictness' | 'structure' | 'language' | 'presentation';
  title: string;
  icon: string;
  snippet: string;
  description: string;
}

export const UPSC_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'standard_8_block',
    name: 'मुख्य सार्वभौमिक प्रॉम्प्ट (V2.4)',
    badge: 'सक्रिय मानक',
    description: '20 वर्षों के अनुभव वाले वरिष्ठ UPSC परीक्षक का सार्वभौमिक नाम-नियम (V2.4) मास्टर प्रॉम्प्ट — सभी विषयों के लिए एकमात्र मुख्य प्रॉम्प्ट।',
    content: MASTER_8_BLOCK_PROMPT
  },
  {
    id: 'strict_topper',
    name: 'खाली स्लॉट 2',
    badge: 'खाली',
    description: 'यह स्लॉट खाली रखा गया है। (मुख्य मूल्यांकन हेतु Slot 1 सक्रिय है)',
    content: ''
  },
  {
    id: 'essay_paper',
    name: 'खाली स्लॉट 3',
    badge: 'खाली',
    description: 'यह स्लॉट खाली रखा गया है। (मुख्य मूल्यांकन हेतु Slot 1 सक्रिय है)',
    content: ''
  },
  {
    id: 'ethics_gs4',
    name: 'खाली स्लॉट 4',
    badge: 'खाली',
    description: 'यह स्लॉट खाली रखा गया है। (मुख्य मूल्यांकन हेतु Slot 1 सक्रिय है)',
    content: ''
  },
  {
    id: 'rapid_examiner',
    name: 'खाली स्लॉट 5',
    badge: 'खाली',
    description: 'यह स्लॉट खाली रखा गया है। (मुख्य मूल्यांकन हेतु Slot 1 सक्रिय है)',
    content: ''
  }
];

export const RULE_SNIPPETS: RuleSnippet[] = [
  {
    id: 'sc_judgments_rule',
    category: 'citations',
    title: '🏛️ सुप्रीम कोर्ट निर्णय व संवैधानिक अनुच्छेद अनिवार्य',
    icon: 'Scale',
    description: 'उत्तर में केस लॉ और आर्टिकल उद्धृत करने का कड़ा नियम',
    snippet: `\n[MANDATORY CONSTITUTIONAL & JUDICIAL CITATIONS]
उत्तर में प्रासंगिक सुप्रीम कोर्ट के मील के पत्थर निर्णयों (जैसे केशवानंद भारती, पुट्टास्वामी, एस.आर. बोम्मई आदि) तथा प्रासंगिक संवैधानिक अनुच्छेदों का उल्लेख अनिवार्य है। इनके अभाव में मार्जिन में लाल पेन से विशिष्ट टिप्पणी दें: "यहाँ अपने तर्कों को पुष्ट करने हेतु संबंधित संवैधानिक अनुच्छेद या SC निर्णय का उल्लेख करें।"\n`
  },
  {
    id: 'niti_data_rule',
    category: 'citations',
    title: '📊 नीति आयोग व आर्थिक सर्वेक्षण डेटा नियम',
    icon: 'TrendingUp',
    description: 'तर्कों को पुष्ट करने के लिए सांख्यिकीय आंकड़े व रिपोर्ट अनिवार्य',
    snippet: `\n[AUTHORITATIVE DATA & REPORT EVIDENCE MANDATE]
तर्कों को केवल सैद्धांतिक न रखें। NITI Aayog की रिपोर्ट, Economic Survey, NFHS, या RBI के आधिकारिक आंकड़ों का संदर्भ दें।\n`
  },
  {
    id: 'strict_penalty_rule',
    category: 'strictness',
    title: '⚖️ मिसिंग \'आगे की राह\' पर कटौती नियम',
    icon: 'AlertCircle',
    description: 'आलोचनात्मक प्रश्नों में समाधान न होने पर सख्त अंक कटौती',
    snippet: `\n[STRICT PENALTY: MISSING WAY FORWARD]
यदि प्रश्न 'Critically Analyze / Evaluate' श्रेणी का है और छात्र ने केवल समस्याएं गिनाकर 'आगे की राह' नहीं लिखा है, तो उस उप-भाग में अधिकतम 30% कटौती करें।\n`
  },
  {
    id: 'diagram_flowchart_rule',
    category: 'presentation',
    title: '🎨 आरेख, फ्लोचार्ट व मानचित्र प्रोत्साहन नियम',
    icon: 'PenTool',
    description: 'केवल प्रक्रिया/भौगोलिक वितरण/तंत्र वाले प्रश्न में आरेख/मानचित्र सुझाएँ',
    snippet: `\n[PRESENTATION & SCHEMATIC DIAGRAM MANDATE]
केवल प्रक्रिया, भौगोलिक वितरण या तंत्र वाले प्रश्न में आरेख/मानचित्र सुझाएँ; कारण या सूची वाले प्रश्न में diagram_scope खाली '' रखें।\n`
  },
  {
    id: 'per_page_comments_rule',
    category: 'structure',
    title: '📑 आनुपातिक पृष्ठ टिप्पणियाँ नियम (1/3→2, Full→5)',
    icon: 'Layers',
    description: 'पृष्ठ के भरे हुए हिस्से के अनुपात में टिप्पणियाँ (1/3 → 2, 1/2 → 3, 2/3 → 4, Full → 5)',
    snippet: `\n[PROPORTIONAL PER-PAGE COMMENTS RULE]
प्रत्येक उत्तर पृष्ठ (page_type="answer_page") पर लिखे गए हिस्से के अनुपात में अधिकतम मार्जिन टिप्पणियाँ दें: 1/3 भरा → अधिकतम 2, 1/2 → 3, 2/3 → 4, पूरा → 5 (बाएँ-दाएँ संतुलित)।\n`
  }
];

export const UPSC_PROMPT_BLOCKS = [
  { id: 'block_1', title: '1. सार्वभौमिक नियम एवं नाम-नियम', searchKeyword: '### 1. सार्वभौमिक नियम', icon: 'CheckSquare' },
  { id: 'block_2', title: '2. प्रश्न विखंडन एवं अंक-एंकर', searchKeyword: '### 2. प्रश्न विखंडन एवं अंक-एंकर', icon: 'Compass' },
  { id: 'block_3', title: '3. स्तंभ 1 — भूमिका मूल्यांकन', searchKeyword: '### 3. स्तंभ 1 — भूमिका मूल्यांकन', icon: 'Feather' },
  { id: 'block_4', title: '4. स्तंभ 2 — मुख्य भाग (C/D/E/F/G)', searchKeyword: '### 4. स्तंभ 2 — मुख्य भाग', icon: 'Scale' },
  { id: 'block_5', title: '5. स्तंभ 3 — प्रस्तुतीकरण', searchKeyword: '### 5. स्तंभ 3 — प्रस्तुतीकरण', icon: 'Layout' },
  { id: 'block_6', title: '6. स्तंभ 4 — निष्कर्ष मूल्यांकन', searchKeyword: '### 6. स्तंभ 4 — निष्कर्ष मूल्यांकन', icon: 'Flag' },
  { id: 'block_7', title: '7. पृष्ठ-वार लाल-पेन मार्जिन टिप्पणियाँ', searchKeyword: '### 7. पृष्ठ-वार लाल-पेन मार्जिन टिप्पणियाँ', icon: 'Pen' },
  { id: 'block_8', title: '8. अंतिम स्व-जाँच (स्व-परीक्षण)', searchKeyword: '### 8. अंतिम स्व-जाँच', icon: 'CheckSquare' }
];
