'use client';

import { useState, useEffect } from 'react';
import type { Module, JsonQuestion, Question, Chapter, ModuleWithQuestions } from '@/data/modules';
import {
  extractChaptersFromQuestions,
  jsonQuestionsToQuestions,
} from '@/data/modules';

export type { Module, Question, Chapter, JsonQuestion, ModuleWithQuestions };
export { extractChaptersFromQuestions, jsonQuestionsToQuestions };

const SS_MODULES: Module[] = [];

export const modules = SS_MODULES;

export const getModuleById = (id: number): Module | undefined =>
  SS_MODULES.find((m) => m.id === id);

export const getAllModules = (): Module[] => SS_MODULES;

const dataCache = new Map<number, JsonQuestion[]>();
let modulesPromise: Promise<Module[]> | null = null;
let modulesState: Module[] = SS_MODULES;
const modulesListeners = new Set<(m: Module[]) => void>();

const CACHE_BUST_KEY = 'learnquiz:cache-bust';

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CACHE_BUST_KEY) {
      dataCache.clear();
      modulesPromise = null;
      fetchModules();
    }
  });
}

async function fetchModules(): Promise<Module[]> {
  if (modulesPromise) return modulesPromise;
  modulesPromise = (async () => {
    try {
      const res = await fetch('/api/modules', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success && Array.isArray(data.modules)) {
        const list = data.modules as Module[];
        modulesState = list;
        modulesListeners.forEach((fn) => fn(list));
        return list;
      }
    } catch {
      // network or parse failure — keep existing seed
    } finally {
      modulesPromise = null;
    }
    return modulesState;
  })();
  return modulesPromise;
}

export async function refreshModules(): Promise<Module[]> {
  modulesPromise = null;
  dataCache.clear();
  if (typeof window !== 'undefined') {
    localStorage.setItem(CACHE_BUST_KEY, String(Date.now()));
  }
  return fetchModules();
}

export function useLiveModules(): Module[] {
  const [modules, setModules] = useState<Module[]>(modulesState);
  useEffect(() => {
    fetchModules();
    const fn = (m: Module[]) => setModules(m);
    modulesListeners.add(fn);
    return () => { modulesListeners.delete(fn); };
  }, []);
  return modules;
}

async function fetchModuleRawJson(moduleId: number): Promise<JsonQuestion[]> {
  if (dataCache.has(moduleId)) {
    return dataCache.get(moduleId)!;
  }

  const res = await fetch(`/api/modules/${moduleId}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  const jsonQuestions = data as JsonQuestion[];
  dataCache.set(moduleId, jsonQuestions);
  return jsonQuestions;
}

export async function getModuleQuestions(moduleId: number): Promise<Question[]> {
  const jsonQuestions = await fetchModuleRawJson(moduleId);
  return jsonQuestionsToQuestions(jsonQuestions);
}

export async function getModuleChapters(moduleId: number): Promise<Chapter[]> {
  const jsonQuestions = await fetchModuleRawJson(moduleId);
  return extractChaptersFromQuestions(jsonQuestions);
}

export async function preloadModuleData(moduleId: number): Promise<{ questions: Question[]; chapters: Chapter[] }> {
  const jsonQuestions = await fetchModuleRawJson(moduleId);
  const questions = jsonQuestionsToQuestions(jsonQuestions);
  const chapters = extractChaptersFromQuestions(jsonQuestions);
  return { questions, chapters };
}

export function clearModuleDataCache(moduleId?: number): void {
  if (moduleId === undefined) {
    dataCache.clear();
  } else {
    dataCache.delete(moduleId);
  }
}