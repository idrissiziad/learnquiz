'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

interface QuestionStats {
  total_answers: number;
  correct_answers: number;
  option_counts: { [optionIndex: string]: number };
}

interface FlushResult {
  statistics?: QuestionStats | null;
  progress?: Record<string, unknown> | null;
}

interface AuthContextType {
  user: { id: string; name: string } | null;
  isLoading: boolean;
  submitAnswer: (moduleId: number, questionId: string, isCorrect: boolean, selectedOptions: number[]) => void;
  getProgress: (moduleId: number) => Promise<{ [key: string]: any }>;
  getAllProgress: () => Promise<{ [key: string]: any }>;
  getQuestionStats: (moduleId: number, questionId: string) => QuestionStats | null;
  invalidateProgressCache: () => void;
  clearProgressAndStats: () => void;
  flushAnswers: () => Promise<FlushResult | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api';
const PROGRESS_CACHE_TTL = 300000;
const FLUSH_INTERVAL = 3000;
const LOCAL_PROGRESS_KEY = 'learnfmpa_progress_cache';
const LOCAL_STATS_PREFIX = 'learnfmpa_stats_';

const DEFAULT_USER = { id: 'default_user', name: 'Étudiant' };

function loadModuleStats(moduleId: number): { [questionId: string]: QuestionStats } {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(`${LOCAL_STATS_PREFIX}${moduleId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

function saveModuleStats(moduleId: number, stats: { [questionId: string]: QuestionStats }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_STATS_PREFIX}${moduleId}`, JSON.stringify(stats));
  } catch {}
}

function recordLocalStat(moduleId: number, questionId: string, selectedOptions: number[], isCorrect: boolean): QuestionStats {
  const stats = loadModuleStats(moduleId);
  if (!stats[questionId]) {
    stats[questionId] = { total_answers: 0, correct_answers: 0, option_counts: {} };
  }
  stats[questionId].total_answers += 1;
  if (isCorrect) {
    stats[questionId].correct_answers += 1;
  }
  for (const opt of selectedOptions) {
    const key = String(opt);
    stats[questionId].option_counts[key] = (stats[questionId].option_counts[key] || 0) + 1;
  }
  saveModuleStats(moduleId, stats);
  return stats[questionId];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const progressCacheRef = useRef<{ data: any | null; timestamp: number }>({ data: null, timestamp: 0 });
  const pendingAnswersRef = useRef<any[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flushPromiseRef = useRef<Promise<FlushResult | null> | null>(null);
  const progressFetchRef = useRef<Promise<any> | null>(null);

  const loadProgressFromStorage = useCallback((): { data: any; timestamp: number } | null => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(LOCAL_PROGRESS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.data && parsed.timestamp) {
          return parsed;
        }
      }
    } catch {}
    return null;
  }, []);

  const saveProgressToStorage = useCallback((data: any) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  }, []);

  const invalidateProgressCache = useCallback(() => {
    progressCacheRef.current = { data: null, timestamp: 0 };
  }, []);

  const clearProgressAndStats = useCallback(() => {
    progressCacheRef.current = { data: null, timestamp: 0 };
    try {
      localStorage.removeItem(LOCAL_PROGRESS_KEY);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(LOCAL_STATS_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const stored = loadProgressFromStorage();
    if (stored) {
      progressCacheRef.current = stored;
    }
    setUser(DEFAULT_USER);
    setIsLoading(false);
  }, [loadProgressFromStorage]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingAnswersRef.current.length > 0) {
        const answers = [...pendingAnswersRef.current];
        pendingAnswersRef.current = [];
        const blob = new Blob(
          [JSON.stringify({ user_id: 'default_user', answers })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(`${API_BASE}/answer`, blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  const flushPendingAnswers = useCallback(async (): Promise<FlushResult | null> => {
    if (pendingAnswersRef.current.length === 0) return null;

    if (flushPromiseRef.current) return flushPromiseRef.current;

    const answersToFlush = [...pendingAnswersRef.current];
    pendingAnswersRef.current = [];

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const currentAnswers = answersToFlush;

    flushPromiseRef.current = (async (): Promise<FlushResult | null> => {
      try {
        const response = await fetch(`${API_BASE}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: 'default_user', answers: currentAnswers })
        });

        const data = await response.json();

        if (data.success) {
          if (data.progress) {
            progressCacheRef.current = { data: data.progress, timestamp: Date.now() };
            saveProgressToStorage(data.progress);
          } else {
            progressCacheRef.current = { data: null, timestamp: 0 };
          }

          return {
            statistics: null,
            progress: data.progress || null,
          };
        }

        return null;
      } catch (error) {
        console.error('Failed to flush answers:', error);
        pendingAnswersRef.current = [...currentAnswers, ...pendingAnswersRef.current];
        return null;
      } finally {
        flushPromiseRef.current = null;
      }
    })();

    return flushPromiseRef.current;
  }, [saveProgressToStorage]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(flushPendingAnswers, FLUSH_INTERVAL);
  }, [flushPendingAnswers]);

  const submitAnswer = useCallback((
    moduleId: number,
    questionId: string,
    isCorrect: boolean,
    selectedOptions: number[]
  ): void => {
    recordLocalStat(moduleId, questionId, selectedOptions, isCorrect);

    const answer = {
      module_id: moduleId,
      question_id: questionId,
      is_correct: isCorrect,
      selected_options: selectedOptions
    };

    pendingAnswersRef.current.push(answer);
    scheduleFlush();
  }, [scheduleFlush]);

  const getProgress = useCallback(async (moduleId: number) => {
    const cache = progressCacheRef.current;
    if (cache.data && Date.now() - cache.timestamp < PROGRESS_CACHE_TTL) {
      return cache.data[`module_${moduleId}`] || {};
    }

    const storedProg = loadProgressFromStorage();
    if (storedProg && storedProg.data && Date.now() - storedProg.timestamp < PROGRESS_CACHE_TTL) {
      progressCacheRef.current = storedProg;
      return storedProg.data[`module_${moduleId}`] || {};
    }

    if (progressFetchRef.current) {
      return progressFetchRef.current.then((data: any) => data?.[`module_${moduleId}`] || {});
    }

    progressFetchRef.current = (async () => {
      try {
        const response = await fetch(`${API_BASE}/progress?user_id=default_user`, {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        const data = await response.json();

        if (data.success && data.progress) {
          progressCacheRef.current = { data: data.progress, timestamp: Date.now() };
          saveProgressToStorage(data.progress);
          return data.progress;
        }
        return storedProg?.data || {};
      } catch (error) {
        console.error('Failed to get progress:', error);
        if (storedProg?.data) {
          progressCacheRef.current = { data: storedProg.data, timestamp: storedProg.timestamp };
          return storedProg.data;
        }
        return {};
      } finally {
        progressFetchRef.current = null;
      }
    })();

    return progressFetchRef.current.then((data: any) => data?.[`module_${moduleId}`] || {});
  }, [loadProgressFromStorage, saveProgressToStorage]);

  const getAllProgress = useCallback(async () => {
    const cache = progressCacheRef.current;
    if (cache.data && Date.now() - cache.timestamp < PROGRESS_CACHE_TTL) {
      return cache.data;
    }

    const storedProg = loadProgressFromStorage();
    if (storedProg && storedProg.data && Date.now() - storedProg.timestamp < PROGRESS_CACHE_TTL) {
      progressCacheRef.current = storedProg;
      return storedProg.data;
    }

    if (progressFetchRef.current) {
      return progressFetchRef.current;
    }

    progressFetchRef.current = (async () => {
      try {
        const response = await fetch(`${API_BASE}/progress?user_id=default_user`, {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        const data = await response.json();

        if (data.success && data.progress) {
          progressCacheRef.current = { data: data.progress, timestamp: Date.now() };
          saveProgressToStorage(data.progress);
          return data.progress;
        }
        return storedProg?.data || {};
      } catch (error) {
        console.error('Failed to get all progress:', error);
        if (storedProg?.data) {
          progressCacheRef.current = { data: storedProg.data, timestamp: storedProg.timestamp };
          return storedProg.data;
        }
        return {};
      } finally {
        progressFetchRef.current = null;
      }
    })();

    return progressFetchRef.current;
  }, [loadProgressFromStorage, saveProgressToStorage]);

  const getQuestionStats = useCallback((moduleId: number, questionId: string): QuestionStats | null => {
    const stats = loadModuleStats(moduleId);
    return stats[questionId] || null;
  }, []);

  const flushAnswers = useCallback(async (): Promise<FlushResult | null> => {
    return flushPendingAnswers();
  }, [flushPendingAnswers]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      submitAnswer,
      getProgress,
      getAllProgress,
      getQuestionStats,
      invalidateProgressCache,
      clearProgressAndStats,
      flushAnswers
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}