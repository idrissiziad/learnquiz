'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import type { ExtendedQuestion } from '@/app/modules/[id]/page';
import type { JsonQuestion } from '@/data/modules';

interface EditChoice {
  text: string;
  isCorrect: boolean;
  explanation: string;
  image: string;
}

export interface SavedPayload {
  questionIndex: number;
  question: JsonQuestion;
}

interface Props {
  moduleId: number;
  questionIndex: number;
  question: ExtendedQuestion;
  darkMode: boolean;
  onClose: () => void;
  onSaved: (payload: SavedPayload) => void;
}

function toChoices(q: ExtendedQuestion): EditChoice[] {
  const count = q.options.length;
  const arr: EditChoice[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      text: q.options[i] ?? '',
      isCorrect: !!(q.correctAnswers && q.correctAnswers.includes(i)),
      explanation: q.answerExplanations?.[i] ?? '',
      image: q.optionImages?.[i] ?? '',
    });
  }
  return arr;
}

function imgPreviewSrc(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/')) return path;
  return `/images/${path}`;
}

export default function QuestionEditor({ moduleId, questionIndex, question, darkMode, onClose, onSaved }: Props) {
  const [questionText, setQuestionText] = useState(question.question || '');
  const [questionImage, setQuestionImage] = useState(question.questionImage || '');
  const [overallExplanation, setOverallExplanation] = useState(question.overallExplanation || '');
  const [yearAsked, setYearAsked] = useState(question.year || '');
  const [subtopic, setSubtopic] = useState(question.chapter || '');
  const [confirmed, setConfirmed] = useState(!!question.confirmed);
  const [choices, setChoices] = useState<EditChoice[]>(() => toChoices(question));

  const [saving, setSaving] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<number | 'question' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileQuestionRef = useRef<HTMLInputElement | null>(null);
  const fileChoiceRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isDark = darkMode;

  const cardCls = isDark
    ? 'bg-gray-800/90 border-gray-700 text-gray-100'
    : 'bg-white border-gray-200 text-gray-800';
  const inputCls = isDark
    ? 'bg-gray-900/70 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-green-500'
    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-green-500';
  const labelCls = isDark ? 'text-gray-300' : 'text-gray-600';

  const updateChoice = (i: number, patch: Partial<EditChoice>) => {
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const addChoice = () => {
    if (choices.length >= 5) return;
    setChoices((prev) => [...prev, { text: '', isCorrect: false, explanation: '', image: '' }]);
  };

  const removeChoice = (i: number) => {
    if (choices.length <= 1) return;
    setChoices((prev) => prev.filter((_, idx) => idx !== i));
  };

  const toggleCorrect = (i: number) => {
    setChoices((prev) => {
      const correctCount = prev.filter((c) => c.isCorrect).length;
      const isMultiple = correctCount > 1 || (correctCount === 1 && !prev[i].isCorrect);
      return prev.map((c, idx) => {
        if (idx !== i) {
          if (!isMultiple) return { ...c, isCorrect: false };
          return c;
        }
        return { ...c, isCorrect: !c.isCorrect };
      });
    });
  };

  const uploadImage = useCallback(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/modules/upload-image', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Upload failed');
    }
    return data.path as string;
  }, []);

  const handleQuestionImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFor('question');
    setError(null);
    try {
      const path = await uploadImage(file);
      setQuestionImage((prev) => (prev ? `${prev},${path}` : path));
    } catch (err) {
      setError((err as Error)?.message || 'Upload failed');
    } finally {
      setUploadingFor(null);
    }
  };

  const handleChoiceImageFile = async (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFor(i);
    setError(null);
    try {
      const path = await uploadImage(file);
      setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, image: c.image ? `${c.image},${path}` : path } : c)));
    } catch (err) {
      setError((err as Error)?.message || 'Upload failed');
    } finally {
      setUploadingFor(null);
    }
  };

  const removeQuestionImage = (seg: string) => {
    setQuestionImage((prev) => prev.split(',').map((s) => s.trim()).filter((s) => s && s !== seg).join(','));
  };
  const removeChoiceImage = (i: number, seg: string) => {
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, image: c.image.split(',').map((s) => s.trim()).filter((s) => s && s !== seg).join(',') } : c)));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!questionText.trim()) {
      setError('Question text cannot be empty.');
      return;
    }
    if (!choices.some((c) => c.isCorrect)) {
      setError('Mark at least one choice as correct.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/modules/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          questionIndex,
          questionText,
          questionImage,
          overallExplanation,
          yearAsked,
          subtopic,
          confirmed,
          choices,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Save failed');
      }
      setSuccess('Saved');
      onSaved({ questionIndex, question: data.question as JsonQuestion });
    } catch (err) {
      setError((err as Error)?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const questionImagePaths = questionImage.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className={`${cardCls} backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl border w-full max-w-3xl max-h-[92vh] overflow-y-auto`}>
        <div className={`p-5 sm:p-6 border-b sticky top-0 z-10 ${cardCls} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold">Edit question</h3>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Question #{questionIndex + 1}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div>
            <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Question text</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={4}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm leading-relaxed resize-y ${inputCls}`}
              placeholder="Question wording"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-sm font-medium ${labelCls}`}>Question image(s)</label>
              <button
                onClick={() => fileQuestionRef.current?.click()}
                disabled={uploadingFor === 'question'}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploadingFor === 'question' ? 'Uploading...' : 'Upload from PC'}
              </button>
              <input ref={fileQuestionRef} type="file" accept="image/*" className="hidden" onChange={handleQuestionImageFile} />
            </div>
            <input
              value={questionImage}
              onChange={(e) => setQuestionImage(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${inputCls}`}
              placeholder="image filename(s), comma-separated (leave blank for no image)"
            />
            {questionImagePaths.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {questionImagePaths.map((seg) => (
                  <div key={seg} className="relative group">
                    <Image src={imgPreviewSrc(seg)} alt={seg} width={120} height={80} className="rounded-lg object-contain h-20 w-28 border shadow-sm" />
                    <button
                      onClick={() => removeQuestionImage(seg)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-sm font-medium ${labelCls}`}>Choices</label>
              <button
                onClick={addChoice}
                disabled={choices.length >= 5}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add choice
              </button>
            </div>

            <div className="space-y-3">
              {choices.map((choice, i) => (
                <div key={i} className={`rounded-xl border p-3 ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50/60'}`}>
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleCorrect(i)}
                      title="Toggle correct"
                      className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold transition-all ${choice.isCorrect ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/30' : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                    <textarea
                      value={choice.text}
                      onChange={(e) => updateChoice(i, { text: e.target.value })}
                      rows={2}
                      className={`flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm resize-y ${inputCls}`}
                      placeholder={`Choice ${String.fromCharCode(65 + i)} text`}
                    />
                    <button
                      onClick={() => removeChoice(i)}
                      disabled={choices.length <= 1}
                      title="Remove choice"
                      className="mt-1 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-40 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-2 pl-10 space-y-2">
                    <textarea
                      value={choice.explanation}
                      onChange={(e) => updateChoice(i, { explanation: e.target.value })}
                      rows={2}
                      className={`w-full px-3 py-2 rounded-lg border text-xs resize-y ${inputCls}`}
                      placeholder="Explanation for this choice (optional)"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={choice.image}
                        onChange={(e) => updateChoice(i, { image: e.target.value })}
                        className={`flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border text-xs font-mono ${inputCls}`}
                        placeholder="choice image filename(s)"
                      />
                      <button
                        onClick={() => fileChoiceRefs.current[i]?.click()}
                        disabled={uploadingFor === i}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {uploadingFor === i ? '...' : 'Image'}
                      </button>
                      <input
                        ref={(el) => { fileChoiceRefs.current[i] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleChoiceImageFile(e, i)}
                      />
                    </div>
                    {choice.image && (() => {
                      const paths = choice.image.split(',').map((s) => s.trim()).filter(Boolean);
                      if (!paths.length) return null;
                      return (
                        <div className="flex flex-wrap gap-2">
                          {paths.map((seg) => (
                            <div key={seg} className="relative group">
                              <Image src={imgPreviewSrc(seg)} alt={seg} width={90} height={60} className="rounded-md object-contain h-14 w-20 border" />
                              <button
                                onClick={() => removeChoiceImage(i, seg)}
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Topic (subtopic)</label>
              <input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} className={`w-full px-3 py-2 rounded-xl border text-sm ${inputCls}`} placeholder="Subtopic / chapter" />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Year / session</label>
              <input value={yearAsked} onChange={(e) => setYearAsked(e.target.value)} className={`w-full px-3 py-2 rounded-xl border text-sm ${inputCls}`} placeholder="e.g. Mai 2022 (Normale)" />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Overall explanation</label>
            <textarea
              value={overallExplanation}
              onChange={(e) => setOverallExplanation(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm resize-y ${inputCls}`}
              placeholder="Overall explanation (optional)"
            />
          </div>

          <label className={`flex items-center gap-2 text-sm ${labelCls} cursor-pointer`}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4 rounded" />
            Verified (Confirmed)
          </label>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-500 text-sm">
              {success}
            </div>
          )}
        </div>

        <div className={`p-5 sm:p-6 border-t flex items-center justify-end gap-3 sticky bottom-0 ${cardCls}`}>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl font-medium transition-all ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}