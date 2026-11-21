import type { RubricPart } from '../components/BodyPartsBreakdown';
import type { ModelExecutionAttempt } from '../components/ModelTokenAuditModal';

export interface Annotation {
  id: string;
  x_percent: number; // 0 to 6 (Left), 87 to 91 (Right)
  y_percent: number; // 10 to 90
  text: string;
  width_percent?: number; // Custom width percentage (default ~14.5%)
  min_height_px?: number; // Custom min-height in pixels
  font_scale?: number; // Custom font scale (default 1.0)
  is_custom_positioned?: boolean; // True when Owner manually drags or adjusts X/Y position
  is_bold?: boolean; // Bold text toggle (default true)
  is_italic?: boolean; // Italic text toggle (default false)
  is_underline?: boolean; // Underlined text toggle (default false)
}

export interface WordCountBreakdown {
  intro_words?: number;
  body_words?: number;
  conclusion_words?: number;
}

export interface WordCountAnalysis {
  total_words: number;
  target_words: number;
  status: 'within_limit' | 'under_limit' | 'over_limit';
  breakdown?: WordCountBreakdown;
  comment?: string;
}

export interface LegibilityIssue {
  y_percent: number;
  issue_description: string;
}

export interface PageEvaluation {
  page_number: number;
  page_type?: 'cover_page' | 'answer_page' | 'blank_page' | string;
  detected_content_summary?: string;
  page_word_count?: number;
  legibility_issues?: LegibilityIssue[];
  annotations: Annotation[];
}

export interface MainBodyPart {
  title?: string;
  part_name?: string;
  kind: 'question_part' | 'presentation' | string;
  score: number;
  max_score: number;
  content_score?: number;
  evidence_score?: number;
  evidence_max?: number;
  deductions?: string;
  feedback?: string;
}

export interface RubricCriterionScore {
  score: number;
  max_score?: number;
  feedback?: string;
  strengths?: string;
  improvements?: string;
  value_addition?: string;
  ideal_approach?: string;
}

export interface RubricBreakdown {
  introduction?: RubricCriterionScore;
  main_body?: {
    score: number;
    max_score: number;
    matched_points?: string[];
    missing_points?: string[];
    presentation_feedback?: string;
    parts?: RubricPart[];
  };
  conclusion?: RubricCriterionScore;
  presentation?: {
    score: number;
    max_score?: number;
    format_and_flow?: string;
    diagram_scope?: string;
    legibility_and_spacing?: string;
    feedback?: string;
  };
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  thinking_tokens?: number;
  static_prefix_tokens?: number;
  image_tokens?: number;
  tokens_saved?: number;
  effective_billable_tokens?: number;
  cache_hit_percent?: number;
  total_tokens: number;
}

export interface EvaluationResult {
  total_marks: {
    obtained: number;
    max_marks: number;
    detected_marks?: number;
    marks_detection_source?: 'self_detected' | 'settings_fallback';
    marks_detection_evidence?: string;
    setting_marks?: number;
  };
  question_analysis?: {
    question_detected?: string;
    detected_subject?: string;
    directive_word?: string;
    core_demand_met?: boolean;
    core_demand_note?: string;
  };
  marks_notes?: string[];
  rubric_breakdown?: RubricBreakdown;
  word_count?: WordCountAnalysis;
  model_used?: string;
  primary_model_requested?: string;
  fallback_occurred?: boolean;
  fallback_reason?: string;
  thinking_level_used?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto' | string;
  applied_slot?: {
    id: number;
    name: string;
  };
  model_execution_history?: ModelExecutionAttempt[];
  token_usage?: TokenUsage;
  annotation_font?: 'kalam' | 'mukta';
  default_font_scale?: number;
  pages: PageEvaluation[];
}

export interface UploadedPage {
  id: string;
  dataUrl: string;
  name: string;
  pageNumber?: number;
  imageUrl?: string;
}

export interface HistoryEntry {
  id: string;
  ownerUid?: string;
  studentEmail?: string;
  subject?: string;
  timestamp: string;
  studentName: string;
  obtained: number;
  max_marks: number;
  evalResult: EvaluationResult;
  uploadedPages: UploadedPage[];
  modelAnswer: string;
  isCloudSynced?: boolean;
}

export interface RubricCriterionItem {
  id: 'introduction' | 'main_body' | 'conclusion';
  title: string;
  hindiTitle: string;
  subTitle: string;
  defaultWeight: number;
  colorName: string;
  colorHex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
  accentClass: string;
  iconSymbol: string;
}

export const DEFAULT_FREQUENT_COMMENTS: string[] = [
  'स्पष्ट परिभाषा लिखें',
  'तथ्य एवं प्रासंगिक आंकड़े शामिल करें',
  'आगे की राह का उल्लेख करें',
  'हस्तलेखन में सुधार करें',
  'निष्कर्ष अधिक प्रभावी बनाएं',
  'सटीक प्रशासनिक शब्दावली का प्रयोग करें',
  'फ्लोचार्ट या आरेख शामिल करें',
  'मुख्य मांग के अनुरूप बिंदुवार लिखें'
];

export const RUBRIC_CRITERIA_CONFIG: RubricCriterionItem[] = [
  {
    id: 'introduction',
    title: 'Introduction Audit',
    hindiTitle: 'भूमिका',
    subTitle: 'क्या प्रस्तावना सीधे प्रश्न की मुख्य मांग को पूरा कर रही है?',
    defaultWeight: 15,
    colorName: 'blue',
    colorHex: '#2563eb',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-700',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    accentClass: 'accent-blue-600',
    iconSymbol: '🎯'
  },
  {
    id: 'main_body',
    title: 'Body & Presentation Audit',
    hindiTitle: 'मुख्य भाग एवं प्रस्तुतीकरण',
    subTitle: 'मॉडल उत्तर बिंदुओं का मिलान एवं बुलेट पॉइंट्स का प्रयोग',
    defaultWeight: 65,
    colorName: 'purple',
    colorHex: '#9333ea',
    bgClass: 'bg-purple-50',
    borderClass: 'border-purple-200',
    textClass: 'text-purple-700',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    accentClass: 'accent-purple-600',
    iconSymbol: '📐'
  },
  {
    id: 'conclusion',
    title: 'Conclusion Audit',
    hindiTitle: 'निष्कर्ष एवं आगे की राह',
    subTitle: 'निष्कर्ष भविष्योन्मुखी एवं संतुलित है?',
    defaultWeight: 20,
    colorName: 'emerald',
    colorHex: '#059669',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    accentClass: 'accent-emerald-600',
    iconSymbol: '📊'
  }
];
