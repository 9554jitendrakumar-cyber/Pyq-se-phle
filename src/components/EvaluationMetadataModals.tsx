import React from 'react';
import { BookOpen, Award, Sliders, X } from 'lucide-react';

interface ModelAnswerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  questionText: string;
  modelAnswer: string;
}

export const ModelAnswerDrawer: React.FC<ModelAnswerDrawerProps> = ({
  isOpen,
  onClose,
  questionText,
  modelAnswer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-amber-300 dark:border-amber-800">
        <div className="p-4 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-slate-800 dark:to-slate-900 border-b border-amber-200 dark:border-amber-900 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              प्रश्न एवं संदर्भ मॉडल उत्तर
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm leading-relaxed">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-wider">
              मूल्यांकित प्रश्न:
            </span>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {questionText || 'प्रश्न निर्दिष्ट नहीं किया गया (सामान्य मूल्यांकन)'}
            </p>
          </div>

          <div className="bg-amber-50/50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>मॉडल उत्तर / मुख्य मूल्यांकन आयाम:</span>
            </span>
            {modelAnswer ? (
              <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 font-sans">
                {modelAnswer}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 italic">
                कोई पृथक मॉडल उत्तर दर्ज नहीं है। AI ने मानक UPSC सिविल सेवा मुख्य परीक्षा मानकों के आधार पर मूल्यांकन किया है।
              </p>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};

interface EditMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  setStudentName: (val: string) => void;
  subject: string;
  setSubject: (val: string) => void;
  maxMarks: number;
  setMaxMarks: (val: number) => void;
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({
  isOpen,
  onClose,
  studentName,
  setStudentName,
  subject,
  setSubject,
  maxMarks,
  setMaxMarks,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 dark:border-slate-700">
        <div className="p-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              कॉपी विवरण संपादित करें
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              अभ्यर्थी का नाम
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="जैसे: राहुल शर्मा"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              विषय / प्रश्नपत्र
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              अधिकतम अंक (Max Marks)
            </label>
            <input
              type="number"
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
          </div>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            सहेजें और बंद करें
          </button>
        </div>
      </div>
    </div>
  );
};
