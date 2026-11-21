import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sliders,
  X,
  RotateCcw,
  Save,
  Check,
  Copy,
  Download,
  Upload,
  Search,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Edit3,
  Trash2,
  BookOpen,
  Sparkles,
  RefreshCw,
  ChevronRight,
  WrapText,
  Type,
  Code2,
  ShieldCheck,
  Compass,
  Layers,
  Undo2,
  Redo2
} from 'lucide-react';
import { 
  UPSC_PROMPT_PRESETS, 
  RULE_SNIPPETS, 
  UPSC_PROMPT_BLOCKS, 
  PromptPreset, 
  RuleSnippet 
} from '../promptPresets';
import { MASTER_8_BLOCK_PROMPT } from '../defaultPrompt';

interface SystemPromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptSlots: { id: number; name: string; content: string }[];
  setPromptSlots: React.Dispatch<React.SetStateAction<{ id: number; name: string; content: string }[]>>;
  activeSlotId: number;
  setActiveSlotId: (id: number) => void;
  editingSlotId: number | null;
  setEditingSlotId: (id: number | null) => void;
  editingSlotName: string;
  setEditingSlotName: (name: string) => void;
  saveSlotName: (id: number, name: string) => void;
  saveSystemPrompt: () => Promise<void>;
  resetSystemPrompt: () => Promise<void>;
  isSaving: boolean;
  showToast: (msg: string) => void;
}

type ViewMode = 'editor' | 'reader' | 'diff';
type FontSize = 'xs' | 'sm' | 'base' | 'lg';

export const SystemPromptEditorModal: React.FC<SystemPromptEditorModalProps> = ({
  isOpen,
  onClose,
  promptSlots,
  setPromptSlots,
  activeSlotId,
  setActiveSlotId,
  editingSlotId,
  setEditingSlotId,
  editingSlotName,
  setEditingSlotName,
  saveSlotName,
  saveSystemPrompt,
  resetSystemPrompt,
  isSaving,
  showToast
}) => {
  if (!isOpen) return null;

  // View & display states
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<FontSize>('sm');
  const [showSnippetsDrawer, setShowSnippetsDrawer] = useState<boolean>(true);
  const [showHealthCheck, setShowHealthCheck] = useState<boolean>(false);

  // Search & Replace state
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);

  // Presets selector state
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // History state for Undo / Redo
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active slot content
  const activeSlot = promptSlots.find(s => s.id === activeSlotId) || promptSlots[0];
  const activeContent = activeSlot?.content || '';

  // Calculate metrics
  const stats = useMemo(() => {
    const text = activeContent;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text.split('\n').length;
    // Approximated token count: ~3.5 chars per token for mixed Devanagari/English
    const estimatedTokens = Math.round(chars / 3.2);
    return { chars, words, lines, estimatedTokens };
  }, [activeContent]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim() || !activeContent) return [];
    const matches: { index: number; line: number }[] = [];
    const lines = activeContent.split('\n');
    let cumulative = 0;
    const lowerQuery = searchQuery.toLowerCase();

    lines.forEach((line, lineIdx) => {
      let idx = line.toLowerCase().indexOf(lowerQuery);
      while (idx !== -1) {
        matches.push({ index: cumulative + idx, line: lineIdx + 1 });
        idx = line.toLowerCase().indexOf(lowerQuery, idx + 1);
      }
      cumulative += line.length + 1;
    });

    return matches;
  }, [searchQuery, activeContent]);

  // Health Audit of the prompt
  const healthAudit = useMemo(() => {
    const text = activeContent;
    const hasModelAnswer = text.includes('<MODEL_ANSWER>') || text.includes('MODEL_ANSWER') || text.includes('मॉडल उत्तर');
    const hasDirectiveTaxonomy = text.includes('DIRECTIVE') || text.includes('पुच्छल्ले') || text.includes('Elucidate') || text.includes('Discuss');
    const hasIntroProtocol = text.includes('INTRODUCTION') || text.includes('भूमिका');
    const hasConclusionProtocol = text.includes('CONCLUSION') || text.includes('निष्कर्ष');
    const hasAnnotationsRule = text.includes('annotation') || text.includes('मार्जिन') || text.includes('लाल पेन');
    const hasWordCount = text.includes('word_count') || text.includes('शब्द गणना') || text.includes('शब्द सीमा');

    const issues: string[] = [];
    if (!hasModelAnswer) issues.push("चेतावनी: प्रॉम्प्ट में '<MODEL_ANSWER>' टैग का संदर्भ नहीं मिला।");
    if (!hasDirectiveTaxonomy) issues.push("चेतावनी: निर्देशात्मक शब्दों के वर्गीकरण का खंड गायब हो सकता है।");
    if (!hasAnnotationsRule) issues.push("सुझाव: लाल पेन मार्जिन टिप्पणियों के निर्देशांक नियम शामिल रखें।");

    const passedChecks = [hasModelAnswer, hasDirectiveTaxonomy, hasIntroProtocol, hasConclusionProtocol, hasAnnotationsRule, hasWordCount].filter(Boolean).length;
    const score = Math.round((passedChecks / 6) * 100);

    return {
      score,
      isHealthy: score >= 60,
      hasModelAnswer,
      hasDirectiveTaxonomy,
      hasIntroProtocol,
      hasConclusionProtocol,
      hasAnnotationsRule,
      hasWordCount,
      issues
    };
  }, [activeContent]);

  // Content updater with Undo tracking
  const updateActiveContent = (newContent: string, saveToUndo = true) => {
    if (saveToUndo) {
      setUndoStack(prev => [...prev.slice(-30), activeContent]);
      setRedoStack([]);
    }
    setPromptSlots(prev => prev.map(s => s.id === activeSlotId ? { ...s, content: newContent } : s));
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, activeContent]);
    updateActiveContent(previous, false);
    showToast('पूर्ववत किया गया');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, activeContent]);
    updateActiveContent(next, false);
    showToast('पुनः किया गया');
  };

  // Synchronize line numbers scroll with textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Jump to specific block
  const handleJumpToBlock = (searchKeyword: string) => {
    setViewMode('editor');
    const idx = activeContent.indexOf(searchKeyword);
    if (idx !== -1 && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(idx, idx + searchKeyword.length);
      
      // Calculate approximate line to scroll
      const textUpToMatch = activeContent.substring(0, idx);
      const lineNumber = textUpToMatch.split('\n').length;
      const lineHeight = fontSize === 'xs' ? 18 : fontSize === 'sm' ? 20 : fontSize === 'base' ? 24 : 28;
      textareaRef.current.scrollTop = Math.max(0, (lineNumber - 3) * lineHeight);
      showToast(`खंड पर पहुंचे: ${searchKeyword.slice(0, 30)}...`);
    } else {
      showToast('यह खंड इस प्रॉम्प्ट में नहीं मिला।');
    }
  };

  // Insert rule snippet at cursor or append
  const handleInsertSnippet = (snippet: string, title: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = activeContent.substring(0, start);
      const after = activeContent.substring(end);
      const newText = before + snippet + after;
      updateActiveContent(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + snippet.length, start + snippet.length);
      }, 50);
    } else {
      updateActiveContent(activeContent + '\n' + snippet);
    }
    showToast(`नियम जोड़ा गया: ${title}`);
  };

  // Apply Preset
  const handleApplyPreset = (presetId: string) => {
    const preset = UPSC_PROMPT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    if (window.confirm(`क्या आप स्लॉट ${activeSlotId} में '${preset.name}' प्रीसेट लागू करना चाहते हैं?`)) {
      updateActiveContent(preset.content);
      showToast(`प्रीसेट लागू: ${preset.name}`);
      setSelectedPresetId('');
    }
  };

  // Search Next / Previous
  const handleFindNext = () => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIdx);
    const match = searchMatches[nextIdx];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(match.index, match.index + searchQuery.length);
  };

  const handleFindPrev = () => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const prevIdx = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIdx);
    const match = searchMatches[prevIdx];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(match.index, match.index + searchQuery.length);
  };

  const handleReplace = () => {
    if (searchMatches.length === 0 || !searchQuery) return;
    const match = searchMatches[currentMatchIndex] || searchMatches[0];
    const before = activeContent.substring(0, match.index);
    const after = activeContent.substring(match.index + searchQuery.length);
    updateActiveContent(before + replaceQuery + after);
    showToast('शब्द बदला गया');
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (activeContent.match(regex) || []).length;
    if (count === 0) {
      showToast('कोई मिलान नहीं मिला');
      return;
    }
    const newText = activeContent.replace(regex, replaceQuery);
    updateActiveContent(newText);
    showToast(`${count} स्थानों पर शब्द बदले गए`);
  };

  // Copy active prompt to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeContent);
      showToast('प्रॉम्प्ट क्लिपबोर्ड में कॉपी हो गया!');
    } catch {
      showToast('कॉपी करने में त्रुटि हुई');
    }
  };

  // Download prompt as .txt file
  const handleDownloadTxt = () => {
    const blob = new Blob([activeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upsc_master_prompt_slot_${activeSlotId}_${activeSlot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('प्रॉम्प्ट फ़ाइल डाउनलोड हो गई!');
  };

  // Upload prompt from .txt file
  const handleUploadTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && content.trim()) {
        updateActiveContent(content);
        showToast(`'${file.name}' से प्रॉम्प्ट सफलतापूर्वक लोड हुआ!`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Duplicate current slot to next available or slot 5
  const handleDuplicateSlot = () => {
    const targetSlot = promptSlots.find(s => s.id !== activeSlotId && (!s.content || s.content.trim() === '')) ||
      promptSlots.find(s => s.id !== activeSlotId);
    if (!targetSlot) return;

    if (window.confirm(`क्या आप स्लॉट ${activeSlotId} की प्रतिलिपि '${targetSlot.name}' (स्लॉट ${targetSlot.id}) में बनाना चाहते हैं?`)) {
      setPromptSlots(prev => prev.map(s => s.id === targetSlot.id ? { ...s, content: activeContent } : s));
      setActiveSlotId(targetSlot.id);
      showToast(`स्लॉट ${targetSlot.id} में प्रतिलिपि तैयार है!`);
    }
  };

  // Clear slot content
  const handleClearSlot = () => {
    if (window.confirm(`क्या आप स्लॉट ${activeSlotId} का पूरा टेक्स्ट हटाना चाहते हैं?`)) {
      updateActiveContent('');
      showToast('स्लॉट खाली कर दिया गया');
    }
  };

  // Font size classes
  const fontSizeClasses = {
    xs: 'text-xs leading-5',
    sm: 'text-sm leading-6',
    base: 'text-base leading-7',
    lg: 'text-lg leading-8'
  }[fontSize];

  return (
    <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md transition-all">
      <div 
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-200 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-7xl h-[92vh]'
        }`}
      >
        {/* TOP MODAL HEADER */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
                  Master Evaluation Rules (System Prompt)
                </h2>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  स्लॉट {activeSlotId}: {activeSlot.name}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  healthAudit.isHealthy 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  <ShieldCheck className="w-3 h-3" />
                  <span>स्वास्थ्य: {healthAudit.score}%</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                AI परीक्षक के सूक्ष्म नियम, निर्देशात्मक शब्द वर्गीकरण, मार्जिन पेन निर्देशांक एवं अंकगणित
              </p>
            </div>
          </div>

          {/* Quick Toolbar Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Search Toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-1.5 rounded-lg border transition-colors ${
                showSearch 
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="खोजें और बदलें (Ctrl+F)"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Word Wrap */}
            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`p-1.5 rounded-lg border transition-colors ${
                wordWrap 
                  ? 'bg-slate-800 text-amber-400 border-amber-500/40' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
              title="Word Wrap टॉगल करें"
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>

            {/* Font Size Selector */}
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
              {(['xs', 'sm', 'base', 'lg'] as FontSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    fontSize === size ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title={`फ़ॉन्ट साइज: ${size.toUpperCase()}`}
                >
                  {size === 'xs' ? 'A-' : size === 'sm' ? 'A' : size === 'base' ? 'A+' : 'A++'}
                </button>
              ))}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 rounded-lg transition-colors"
              title={isFullscreen ? 'सामान्य दृश्य' : 'फुलस्क्रीन'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-colors ml-1"
              title="बंद करें"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SUB-HEADER: TABS, PRESETS & ACTIONS BAR */}
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
          {/* Slot Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1 hidden md:inline flex items-center gap-1">
              <Layers className="w-3 h-3 text-amber-500" />
              <span>स्लॉट:</span>
            </span>
            {promptSlots.map((slot) => {
              const isActive = activeSlotId === slot.id;
              const isEditing = editingSlotId === slot.id;

              return (
                <div key={slot.id} className="flex items-center shrink-0">
                  {isEditing ? (
                    <div className="flex items-center bg-white dark:bg-slate-900 border-2 border-amber-500 rounded-lg shadow-sm">
                      <input
                        autoFocus
                        value={editingSlotName}
                        onChange={(e) => setEditingSlotName(e.target.value)}
                        onBlur={() => saveSlotName(slot.id, editingSlotName)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSlotName(slot.id, editingSlotName);
                          if (e.key === 'Escape') setEditingSlotId(null);
                        }}
                        className="px-2 py-1 text-xs font-bold outline-none bg-transparent text-slate-800 dark:text-slate-200 w-32"
                      />
                      <button
                        onClick={() => saveSlotName(slot.id, editingSlotName)}
                        className="px-1.5 py-1 text-amber-600 hover:text-amber-700"
                        title="नाम सहेजें"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center rounded-lg border transition-all ${
                        isActive
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <button
                        onClick={async () => {
                          setActiveSlotId(slot.id);
                          localStorage.setItem('upsc_active_slot_id', slot.id.toString());
                          const defaultPreset = UPSC_PROMPT_PRESETS[slot.id - 1] || UPSC_PROMPT_PRESETS[0];
                          const targetContent = (slot.content && slot.content.trim() !== '') ? slot.content : defaultPreset.content;
                          
                          // If empty, auto-populate the preset
                          if (!slot.content || slot.content.trim() === '') {
                            updateActiveContent(defaultPreset.content, false);
                          }

                          try {
                            await fetch('/api/system-prompt', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompt: targetContent,
                                slotId: slot.id,
                                slotName: slot.name
                              })
                            });
                          } catch (err) {
                            console.error('Failed to sync slot prompt to server:', err);
                          }
                          showToast(`सक्रिय स्लॉट बदला: ${slot.name} (100% कठोरता से लागू)`);
                        }}
                        className="px-2.5 py-1 text-xs truncate max-w-[130px] font-bold"
                        title={slot.name}
                      >
                        {slot.name}
                      </button>
                      <button
                        onClick={() => {
                          setEditingSlotId(slot.id);
                          setEditingSlotName(slot.name);
                        }}
                        className={`px-1.5 py-1 border-l opacity-70 hover:opacity-100 transition-opacity ${
                          isActive ? 'border-white/20 hover:bg-amber-700' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                        title="स्लॉट का नाम बदलें"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Preset Selector & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Apply Presets Dropdown */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <select
                value={selectedPresetId}
                onChange={(e) => {
                  setSelectedPresetId(e.target.value);
                  if (e.target.value) handleApplyPreset(e.target.value);
                }}
                className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="">⚡ UPSC टेम्पलेट लागू करें...</option>
                {UPSC_PROMPT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-200 dark:bg-slate-750 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700">
              <button
                onClick={() => setViewMode('editor')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                  viewMode === 'editor'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>संपादक</span>
              </button>
              <button
                onClick={() => setViewMode('reader')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                  viewMode === 'reader'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>पठन मोड</span>
              </button>
            </div>

            {/* Quick Actions */}
            <button
              onClick={handleCopy}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors"
              title="संपूर्ण प्रॉम्प्ट कॉपी करें"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleDownloadTxt}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors"
              title=".txt फ़ाइल डाउनलोड करें"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors"
              title=".txt फ़ाइल से लोड करें"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleUploadTxt} 
              accept=".txt" 
              className="hidden" 
            />

            <button
              onClick={handleDuplicateSlot}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-amber-600 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors"
              title="अन्य स्लॉट में कॉपी करें"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleClearSlot}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-rose-600 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs transition-colors"
              title="स्लॉट खाली करें"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ACTIVE SLOT DIRECTIVE NOTICE BAR */}
        <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>सक्रिय स्लॉट: <span className="underline decoration-emerald-500 font-extrabold">{activeSlot.name}</span> (स्लॉट {activeSlot.id})</span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-semibold border border-emerald-300 dark:border-emerald-700">
              यही स्लॉट मूल्यांकन में उपयोग होगा (कोई डिफ़ॉल्ट फॉलबैक नहीं)
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 hidden sm:inline font-medium">
            {activeContent.trim() ? '✅ प्रॉम्प्ट सक्रिय एवं तैयार' : '⚠️ स्लॉट खाली है'}
          </span>
        </div>

        {/* SEARCH & REPLACE BAR (COLLAPSIBLE) */}
        {showSearch && (
          <div className="px-4 py-2 bg-amber-50/80 dark:bg-slate-950 border-b border-amber-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs animate-fade-in shrink-0">
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="खोजें..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentMatchIndex(0);
                }}
                className="outline-none bg-transparent text-slate-800 dark:text-slate-200 w-36 sm:w-48 font-medium"
              />
              {searchMatches.length > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold ml-1">
                  {currentMatchIndex + 1}/{searchMatches.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleFindPrev}
                disabled={searchMatches.length === 0}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[11px] font-bold disabled:opacity-40"
              >
                ← पिछला
              </button>
              <button
                onClick={handleFindNext}
                disabled={searchMatches.length === 0}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[11px] font-bold disabled:opacity-40"
              >
                अगला →
              </button>
            </div>

            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 ml-2">
              <input
                type="text"
                placeholder="बदलें..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                className="outline-none bg-transparent text-slate-800 dark:text-slate-200 w-36 sm:w-48 font-medium"
              />
            </div>

            <button
              onClick={handleReplace}
              disabled={searchMatches.length === 0}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[11px] disabled:opacity-40"
            >
              बदलें
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={searchMatches.length === 0}
              className="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded font-bold text-[11px] disabled:opacity-40"
            >
              सभी बदलें
            </button>

            <button
              onClick={() => setShowSearch(false)}
              className="ml-auto text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MAIN BODY AREA: SIDEBAR + EDITOR/READER */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR: OUTLINE, VARIABLES & QUICK SNIPPETS */}
          <div className="w-64 sm:w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shrink-0 hidden md:flex">
            {/* Sidebar Tabs */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-500" />
                <span>प्रॉम्प्ट संरचना</span>
              </span>
              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold px-1.5 py-0.5 rounded">
                {UPSC_PROMPT_BLOCKS.length} खंड
              </span>
            </div>

            {/* 8 Blocks Table of Contents */}
            <div className="p-2 space-y-1 overflow-y-auto max-h-52 border-b border-slate-200 dark:border-slate-800 custom-scrollbar">
              {UPSC_PROMPT_BLOCKS.map((block) => (
                <button
                  key={block.id}
                  onClick={() => handleJumpToBlock(block.searchKeyword)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-amber-100/70 dark:hover:bg-amber-950/40 hover:text-amber-900 dark:hover:text-amber-200 transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{block.title}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-amber-600 shrink-0" />
                </button>
              ))}
            </div>

            {/* One-Click Rule Snippets Drawer */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>त्वरित नियम जोड़ें</span>
              </span>
              <button
                onClick={() => setShowSnippetsDrawer(!showSnippetsDrawer)}
                className="text-[10px] text-amber-600 font-bold"
              >
                {showSnippetsDrawer ? 'छिपाएं' : 'दिखाएं'}
              </button>
            </div>

            {showSnippetsDrawer && (
              <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                {/* Template Variables */}
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                    चर टैग:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { tag: '<MODEL_ANSWER>', label: 'Model Answer' },
                      { tag: '<RUBRIC_RULES>', label: 'Rubrics' },
                      { tag: '<QUESTION>', label: 'Question' }
                    ].map((v) => (
                      <button
                        key={v.tag}
                        onClick={() => handleInsertSnippet(v.tag, v.label)}
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-amber-500 hover:text-white rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 transition-colors"
                        title="प्रॉम्प्ट में वेरिएबल डालें"
                      >
                        {v.tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pre-crafted Rule Snippets */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                    अनुशंसित UPSC क्लॉज:
                  </span>
                  {RULE_SNIPPETS.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600 shadow-xs transition-all group"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 leading-tight">
                          {item.title}
                        </span>
                        <button
                          onClick={() => handleInsertSnippet(item.snippet, item.title)}
                          className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded text-[10px] font-bold group-hover:bg-amber-600 group-hover:text-white transition-colors"
                          title="इस नियम को प्रॉम्प्ट में डालें"
                        >
                          + जोड़ें
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CENTER: EDITOR OR READER VIEW */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
            {viewMode === 'editor' ? (
              <div className="flex-1 flex overflow-hidden relative">
                {/* Line Numbers Gutter */}
                <div
                  ref={lineNumbersRef}
                  className="w-12 py-3 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 text-right pr-2 select-none overflow-hidden font-mono text-[11px] text-slate-400 hidden sm:block shrink-0"
                >
                  {Array.from({ length: stats.lines }).map((_, idx) => (
                    <div key={idx} className="leading-6">
                      {idx + 1}
                    </div>
                  ))}
                </div>

                {/* The Core Textarea */}
                <textarea
                  ref={textareaRef}
                  value={activeContent}
                  onChange={(e) => updateActiveContent(e.target.value)}
                  onScroll={handleScroll}
                  wrap={wordWrap ? 'soft' : 'off'}
                  spellCheck={false}
                  className={`flex-1 w-full h-full p-3 sm:p-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono ${fontSizeClasses} outline-none resize-none custom-scrollbar selection:bg-amber-200 dark:selection:bg-amber-900/60`}
                  placeholder="Master System Prompt यहाँ लिखें..."
                />
              </div>
            ) : (
              /* STRUCTURED READER VIEW (HUMAN-READABLE RENDERED PREVIEW) */
              <div className="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-950 custom-scrollbar space-y-6">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>संरचित पठन मोड</span>
                  </div>
                  <p className="text-xs text-emerald-700/90 dark:text-emerald-300/80">
                    यह AI परीक्षक के लिए वर्तमान में सक्रिय प्रॉम्प्ट का सुव्यवस्थित व पठनीय दृश्य है।
                  </p>
                </div>

                <div className="space-y-4 max-w-4xl mx-auto">
                  {activeContent.split(/(?====+)/).map((section, idx) => {
                    if (!section.trim()) return null;
                    const lines = section.trim().split('\n');
                    const headerLine = lines.find(l => l.match(/^[0-9]\./) || l.includes('PROTOCOL') || l.includes('CLAUSE')) || lines[0];

                    return (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all hover:border-amber-300 dark:hover:border-amber-700"
                      >
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 text-amber-700 dark:text-amber-400">
                          {headerLine}
                        </h3>
                        <div className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-relaxed whitespace-pre-wrap">
                          {section.replace(headerLine, '').replace(/={5,}/g, '').trim()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM MODAL FOOTER & SAVE BAR */}
        <div className="px-4 py-3 bg-slate-100 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Metrics & Health Badges */}
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
            <span className="font-mono font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
              {stats.lines} पंक्तियां
            </span>
            <span className="font-mono font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
              {stats.words.toLocaleString()} शब्द
            </span>
            <span className="font-mono font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
              {stats.chars.toLocaleString()} वर्ण
            </span>
            <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
              ~{stats.estimatedTokens.toLocaleString()} Tokens
            </span>

            {/* Undo / Redo controls */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                title="पूर्ववत करें"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                title="पुनः करें"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={resetSystemPrompt}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 rounded-xl transition-colors flex items-center gap-1.5"
              title="इस सक्रिय स्लॉट को 8-ब्लॉक मानक पर पुनर्स्थापित करें"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>सक्रिय स्लॉट रीसेट</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-xl transition-colors"
            >
              रद्द करें
            </button>

            <button
              type="button"
              onClick={saveSystemPrompt}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 active:bg-amber-700 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer active:scale-95"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>प्रॉम्प्ट लागू करें एवं सहेजें</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
