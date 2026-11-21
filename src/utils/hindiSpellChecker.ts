/**
 * Lightweight Hindi Spell-Check & Orthographic Validation Layer
 * Specifically tuned for UPSC Mains Answer Evaluation & Marginal Annotations.
 */

export interface HindiOrthographicIssue {
  id: string;
  word: string;
  cleanWord: string;
  index: number;
  length: number;
  suggestion: string;
  reason: string;
  category: 'matra' | 'consonant' | 'standard' | 'structural' | 'grammar';
}

export interface SpellCheckResult {
  hasErrors: boolean;
  issues: HindiOrthographicIssue[];
  fixedText: string;
}

// Common Devanagari Hindi Orthographic & Lexical Dictionary for Evaluation
// Maps commonly misspelled words or non-standard forms to their UPSC standard Hindi spelling
const HINDI_CORRECTIONS_DICT: Record<string, { suggestion: string; reason: string; category: HindiOrthographicIssue['category'] }> = {
  // Matra / Vowel length (ह्रस्व / दीर्घ स्वर दोष)
  'परिक्षा': { suggestion: 'परीक्षा', reason: 'दीर्घ \'ई\' (ी) की मात्रा मानक है', category: 'matra' },
  'भुमिका': { suggestion: 'भूमिका', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा मानक है', category: 'matra' },
  'गलति': { suggestion: 'गलती', reason: 'दीर्घ \'ई\' (ी) की मात्रा प्रयुक्त करें', category: 'matra' },
  'कमि': { suggestion: 'कमी', reason: 'दीर्घ \'ई\' (ी) की मात्रा प्रयुक्त करें', category: 'matra' },
  'शुरु': { suggestion: 'शुरू', reason: 'अंतिम \'र\' पर दीर्घ \'ऊ\' (ू) की मात्रा होती है', category: 'matra' },
  'अनुकुल': { suggestion: 'अनुकूल', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा सही है', category: 'matra' },
  'प्रतिकुल': { suggestion: 'प्रतिकूल', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा सही है', category: 'matra' },
  'महत्वपुर्ण': { suggestion: 'महत्वपूर्ण', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा मानक है', category: 'matra' },
  'उल्लेखनिय': { suggestion: 'उल्लेखनीय', reason: 'दीर्घ \'ई\' (ी) की मात्रा सही है', category: 'matra' },
  'प्रस्तुतिकरण': { suggestion: 'प्रस्तुतीकरण', reason: '\'करण\' प्रत्यय से पूर्व दीर्घ \'ई\' (ी) आती है', category: 'matra' },
  'स्पष्टीकरण': { suggestion: 'स्पष्टीकरण', reason: '\'करण\' प्रत्यय से पूर्व दीर्घ \'ई\' (ी) आती है', category: 'matra' },
  'शुद्धिकरण': { suggestion: 'शुद्धीकरण', reason: '\'करण\' प्रत्यय से पूर्व दीर्घ \'ई\' (ी) आती है', category: 'matra' },
  'श्रीमति': { suggestion: 'श्रीमती', reason: 'दीर्घ \'ई\' (ी) की मात्रा सही है', category: 'matra' },
  'स्थिती': { suggestion: 'स्थिति', reason: 'अंतिम ह्रस्व \'इ\' (ि) की मात्रा मानक है', category: 'matra' },
  'निति': { suggestion: 'नीति', reason: 'प्रथम दीर्घ \'ई\' और अंतिम ह्रस्व \'इ\' की मात्रा मानक है', category: 'matra' },
  'पूर्ती': { suggestion: 'पूर्ति', reason: 'अंतिम ह्रस्व \'इ\' (ि) की मात्रा मानक है', category: 'matra' },
  'हानी': { suggestion: 'हानि', reason: 'अंतिम ह्रस्व \'इ\' (ि) की मात्रा मानक है', category: 'matra' },
  'शक्ती': { suggestion: 'शक्ति', reason: 'अंतिम ह्रस्व \'इ\' (ि) की मात्रा मानक है', category: 'matra' },
  'पुज्य': { suggestion: 'पूज्य', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा सही है', category: 'matra' },
  'दुसरा': { suggestion: 'दूसरा', reason: 'दीर्घ \'ऊ\' (ू) की मात्रा सही है', category: 'matra' },

  // Consonants & Sibilants (श / ष / स, क्ष / छ, ण / न दोष)
  'विश्लेशण': { suggestion: 'विश्लेषण', reason: 'मूर्धन्य \'ष\' का प्रयोग शुद्ध है', category: 'consonant' },
  'विशलेषण': { suggestion: 'विश्लेषण', reason: 'आधा \'श्\' और \'ष\' मानक वर्तनी है', category: 'consonant' },
  'विस्लेषण': { suggestion: 'विश्लेषण', reason: 'तालव्य \'श्\' और मूर्धन्य \'ष\' शुद्ध है', category: 'consonant' },
  'निस्कर्ष': { suggestion: 'निष्कर्ष', reason: 'मूर्धन्य आधा \'ष्\' मानक वर्तनी है', category: 'consonant' },
  'निकर्ष': { suggestion: 'निष्कर्ष', reason: 'मूर्धन्य आधा \'ष्\' और रेफ शुद्ध है', category: 'consonant' },
  'प्रसासन': { suggestion: 'प्रशासन', reason: 'तालव्य \'श\' का प्रयोग शुद्ध है', category: 'consonant' },
  'सासन': { suggestion: 'शासन', reason: 'तालव्य \'श\' का प्रयोग शुद्ध है', category: 'consonant' },
  'छेत्र': { suggestion: 'क्षेत्र', reason: 'संयुक्त वर्ण \'क्ष\' का प्रयोग शुद्ध है', category: 'consonant' },
  'छति': { suggestion: 'क्षति', reason: 'संयुक्त वर्ण \'क्ष\' का प्रयोग शुद्ध है', category: 'consonant' },
  'लछन': { suggestion: 'लक्षण', reason: '\'क्ष\' एवं \'ण\' का प्रयोग शुद्ध है', category: 'consonant' },
  'उदाहरन': { suggestion: 'उदाहरण', reason: 'मूर्धन्य \'ण\' मानक वर्तनी है', category: 'consonant' },
  'कारन': { suggestion: 'कारण', reason: 'मूर्धन्य \'ण\' मानक वर्तनी है', category: 'consonant' },
  'प्रमान': { suggestion: 'प्रमाण', reason: 'मूर्धन्य \'ण\' मानक वर्तनी है', category: 'consonant' },
  'द्रष्टिकोण': { suggestion: 'दृष्टिकोण', reason: '\'ऋ\' की मात्रा (दृ) मानक है', category: 'consonant' },
  'शृंगार': { suggestion: 'शृंगार', reason: '\'श\' में \'ऋ\' (शृ) शुद्ध है, \'श्रृ\' अशुद्ध है', category: 'consonant' },
  'श्रृंगार': { suggestion: 'शृंगार', reason: '\'श\' में \'ऋ\' (शृ) शुद्ध है, \'श्रृ\' अशुद्ध है', category: 'consonant' },
  'ऋषि': { suggestion: 'ऋषि', reason: 'शुद्ध मानक वर्तनी', category: 'consonant' },
  'रिषि': { suggestion: 'ऋषि', reason: '\'ऋ\' स्वर का प्रयोग शुद्ध है', category: 'consonant' },
  'स्रष्टि': { suggestion: 'सृष्टि', reason: '\'स\' में \'ऋ\' (सृ) शुद्ध है', category: 'consonant' },
  'अनुछेद': { suggestion: 'अनुच्छेद', reason: 'द्वित्व \'च्छ\' (आधा च + छ) शुद्ध है', category: 'consonant' },
  'अस्पस्ट': { suggestion: 'अस्पष्ट', reason: 'मूर्धन्य \'ष्ट\' का प्रयोग सही है', category: 'consonant' },
  'स्पस्ट': { suggestion: 'स्पष्ट', reason: 'मूर्धन्य \'ष्ट\' का प्रयोग सही है', category: 'consonant' },
  'अशुध': { suggestion: 'अशुद्ध', reason: '\'द्ध\' (द् + ध) शुद्ध है', category: 'consonant' },
  'शुध': { suggestion: 'शुद्ध', reason: '\'द्ध\' (द् + ध) शुद्ध है', category: 'consonant' },
  'प्रसतावना': { suggestion: 'प्रस्तावना', reason: 'आधा \'स्\' (स्त) शुद्ध है', category: 'consonant' },

  // Nukta omissions (नुक्ता दोष: ड़ / ढ़)
  'सडक': { suggestion: 'सड़क', reason: 'नुक्ता युक्त \'ड़\' मानक है', category: 'consonant' },
  'पेड': { suggestion: 'पेड़', reason: 'नुक्ता युक्त \'ड़\' मानक है', category: 'consonant' },
  'पढना': { suggestion: 'पढ़ना', reason: 'नुक्ता युक्त \'ढ़\' मानक है', category: 'consonant' },
  'पढाई': { suggestion: 'पढ़ाई', reason: 'नुक्ता युक्त \'ढ़\' मानक है', category: 'consonant' },
  'गाडी': { suggestion: 'गाड़ी', reason: 'नुक्ता युक्त \'ड़\' मानक है', category: 'consonant' },
  'बडा': { suggestion: 'बड़ा', reason: 'नुक्ता युक्त \'ड़\' मानक है', category: 'consonant' },
  'जोडे': { suggestion: 'जोड़ें', reason: 'नुक्ता युक्त \'ड़\' और अनुस्वार मानक है', category: 'consonant' },
  'जोडें': { suggestion: 'जोड़ें', reason: 'नुक्ता युक्त \'ड़\' मानक है', category: 'consonant' },

  // Ba vs Va (ब / व दोष)
  'बिचार': { suggestion: 'विचार', reason: 'दंतौष्ठ्य \'व\' मानक है', category: 'consonant' },
  'बिकास': { suggestion: 'विकास', reason: 'दंतौष्ठ्य \'व\' मानक है', category: 'consonant' },
  'बिबरण': { suggestion: 'विवरण', reason: 'दंतौष्ठ्य \'व\' मानक है', category: 'consonant' },

  // Standard Hindi Grammar & Suffix Rules (केंद्रीय हिंदी निदेशालय / UPSC मानक)
  'गये': { suggestion: 'गए', reason: 'मानक हिंदी में क्रिया रूप \'ए\' स्वर से अंत होता है', category: 'standard' },
  'गयी': { suggestion: 'गई', reason: 'मानक हिंदी में क्रिया रूप \'ई\' स्वर से अंत होता है', category: 'standard' },
  'हुये': { suggestion: 'हुए', reason: 'मानक हिंदी में क्रिया रूप \'ए\' स्वर से अंत होता है', category: 'standard' },
  'हुयी': { suggestion: 'हुई', reason: 'मानक हिंदी में क्रिया रूप \'ई\' स्वर से अंत होता है', category: 'standard' },
  'चाहिये': { suggestion: 'चाहिए', reason: 'विधि क्रिया में \'ए\' स्वर मानक है', category: 'standard' },
  'दिये': { suggestion: 'दिए', reason: 'मानक हिंदी में \'दिए\' शुद्ध है', category: 'standard' },
  'लिये': { suggestion: 'लिए', reason: 'कारक संबंध में \'लिए\' शुद्ध है', category: 'standard' },
  'नयी': { suggestion: 'नई', reason: 'मानक हिंदी में \'नई\' रूप मान्य है', category: 'standard' },
  'नये': { suggestion: 'नए', reason: 'मानक हिंदी में \'नए\' रूप मान्य है', category: 'standard' },

  // High Frequency Evaluation Vocabulary (कवयित्री, उज्ज्वल, आशीर्वाद, आदि)
  'कवियत्री': { suggestion: 'कवयित्री', reason: '\'कवयित्री\' शुद्ध वर्तनी है', category: 'standard' },
  'उज्वल': { suggestion: 'उज्ज्वल', reason: 'दो बार आधा \'ज्\' (ज्ज्व) शुद्ध है', category: 'standard' },
  'उज्जवल': { suggestion: 'उज्ज्वल', reason: 'दो बार आधा \'ज्\' (ज्ज्व) शुद्ध है', category: 'standard' },
  'आर्शीवाद': { suggestion: 'आशीर्वाद', reason: 'रेफ \'वा\' पर लगता है (आशीर्वाद)', category: 'standard' },
  'आशिरवाद': { suggestion: 'आशीर्वाद', reason: 'रेफ \'वा\' पर लगता है (आशीर्वाद)', category: 'standard' },
  'व्यवहारिक': { suggestion: 'व्यावहारिक', reason: '\'इक\' प्रत्यय से आदि स्वर दीर्घ \'व्या\' बनता है', category: 'standard' },
  'समजिक': { suggestion: 'सामाजिक', reason: '\'इक\' प्रत्यय से आदि स्वर दीर्घ \'सा\' बनता है', category: 'standard' },
  'प्रमाणिक': { suggestion: 'प्रामाणिक', reason: '\'इक\' प्रत्यय से आदि स्वर दीर्घ \'प्रा\' बनता है', category: 'standard' },
  'इतिहासिक': { suggestion: 'ऐतिहासिक', reason: '\'इक\' प्रत्यय से प्रथम स्वर \'ऐ\' बनता है', category: 'standard' },
  'राजनैतिक': { suggestion: 'राजनीतिक', reason: 'मानक रूप \'राजनीतिक\' है', category: 'standard' },
  'अतिश्योक्ति': { suggestion: 'अतिशयोक्ति', reason: 'पूरा \'श\' (अतिशय + उक्ति) शुद्ध है', category: 'standard' },
  'अवश्यक': { suggestion: 'आवश्यक', reason: 'दीर्घ \'आ\' (आवश्यक) शुद्ध है', category: 'standard' },
  'आवशयक': { suggestion: 'आवश्यक', reason: 'आधा \'श्\' (श्यक) शुद्ध है', category: 'standard' },
  'पुनरावृति': { suggestion: 'पुनरावृत्ति', reason: 'द्वित्व \'त्त\' और \'ऋ\' (त्ति) शुद्ध है', category: 'standard' },
  'शब्दावलि': { suggestion: 'शब्दावली', reason: 'दीर्घ \'ई\' (ी) की मात्रा मानक है', category: 'matra' }
};

/**
 * Structural / Pattern-based Orthographic Checks (Devanagari Unicode sanity)
 */
function checkStructuralIssues(word: string, offset: number): HindiOrthographicIssue | null {
  // Check for consecutive vowel signs (e.g. ाा, िी, ुू, etc.)
  const doubleMatraMatch = word.match(/[\u093E-\u094C][\u093E-\u094C]/);
  if (doubleMatraMatch) {
    return {
      id: `struct-matra-${offset}`,
      word,
      cleanWord: word,
      index: offset,
      length: word.length,
      suggestion: word.replace(/([\u093E-\u094C])[\u093E-\u094C]+/g, '$1'),
      reason: 'दोहरी मात्रा दोष',
      category: 'structural'
    };
  }

  // Check for consecutive halants (््)
  if (word.includes('\u094D\u094D')) {
    return {
      id: `struct-halant-${offset}`,
      word,
      cleanWord: word,
      index: offset,
      length: word.length,
      suggestion: word.replace(/\u094D+/g, '\u094D'),
      reason: 'दोहरे हलंत दोष',
      category: 'structural'
    };
  }

  // Check for consecutive anusvaras (ंं)
  if (word.includes('\u0902\u0902')) {
    return {
      id: `struct-anusvara-${offset}`,
      word,
      cleanWord: word,
      index: offset,
      length: word.length,
      suggestion: word.replace(/\u0902+/g, '\u0902'),
      reason: 'दोहरा अनुस्वार दोष',
      category: 'structural'
    };
  }

  // Check for consecutive nuktas (़़)
  if (word.includes('\u093C\u093C')) {
    return {
      id: `struct-nukta-${offset}`,
      word,
      cleanWord: word,
      index: offset,
      length: word.length,
      suggestion: word.replace(/\u093C+/g, '\u093C'),
      reason: 'दोहरा नुक्ता दोष',
      category: 'structural'
    };
  }

  return null;
}

/**
 * Validate Hindi text and return identified orthographic issues with suggestions
 */
export function validateHindiOrthography(text: string): SpellCheckResult {
  if (!text || !text.trim()) {
    return { hasErrors: false, issues: [], fixedText: text };
  }

  const issues: HindiOrthographicIssue[] = [];
  let workingText = text;

  // Contextual check: 'कहा की' / 'माना की' -> 'कहा कि' / 'माना कि'
  const conjunctionRegex = /(कहा|माना|देखा|पाया|स्पष्ट|सुझाव|निष्कर्ष|कारण|उल्लेख)\s+(की)(?=[\s।,.]|$)/gu;
  let conjMatch: RegExpExecArray | null;
  while ((conjMatch = conjunctionRegex.exec(text)) !== null) {
    const fullMatch = conjMatch[0];
    const triggerWord = conjMatch[1];
    const wrongWord = conjMatch[2];
    const matchIndex = conjMatch.index + triggerWord.length + 1;

    issues.push({
      id: `conj-${matchIndex}`,
      word: wrongWord,
      cleanWord: wrongWord,
      index: matchIndex,
      length: wrongWord.length,
      suggestion: 'कि',
      reason: 'उपवाक्य योजक के रूप में ह्रस्व \'कि\' प्रयुक्त होता है',
      category: 'grammar'
    });
  }

  // Word-by-word analysis with exact character positioning
  // Matches Devanagari words possibly with punctuation attached
  const wordRegex = /([\u0900-\u097F]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(text)) !== null) {
    const matchedWord = match[0];
    const offset = match.index;

    // Check against standard correction dictionary
    if (HINDI_CORRECTIONS_DICT[matchedWord]) {
      const entry = HINDI_CORRECTIONS_DICT[matchedWord];
      issues.push({
        id: `dict-${offset}-${matchedWord}`,
        word: matchedWord,
        cleanWord: matchedWord,
        index: offset,
        length: matchedWord.length,
        suggestion: entry.suggestion,
        reason: entry.reason,
        category: entry.category
      });
      continue;
    }

    // Check structural Devanagari rules
    const structIssue = checkStructuralIssues(matchedWord, offset);
    if (structIssue) {
      issues.push(structIssue);
    }
  }

  // Generate automatically fixed text if all suggestions are accepted
  let fixedText = text;
  // Sort reverse by index so replacing doesn't shift earlier offsets
  const sortedIssues = [...issues].sort((a, b) => b.index - a.index);
  sortedIssues.forEach((issue) => {
    fixedText =
      fixedText.substring(0, issue.index) +
      issue.suggestion +
      fixedText.substring(issue.index + issue.length);
  });

  return {
    hasErrors: issues.length > 0,
    issues,
    fixedText
  };
}

/**
 * Replaces a single issue in text with its suggestion
 */
export function applyHindiSpellingCorrection(
  text: string,
  issue: HindiOrthographicIssue
): string {
  if (text.substring(issue.index, issue.index + issue.length) === issue.word) {
    return (
      text.substring(0, issue.index) +
      issue.suggestion +
      text.substring(issue.index + issue.length)
    );
  }
  // Fallback: replace first matching occurrence of the word
  return text.replace(new RegExp(`\\b${issue.word}\\b`, 'u'), issue.suggestion);
}
