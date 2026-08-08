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

export function useLiveModules(): Module[] {
  const [modules, setModules] = useState<Module[]>(SS_MODULES);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/modules', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.modules)) {
          setModules(data.modules as Module[]);
        }
      } catch {
        // network or parse failure — keep seed
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return modules;
}

export async function refreshModules(): Promise<Module[]> {
  try {
    const res = await fetch('/api/modules', { cache: 'no-store' });
    const data = await res.json();
    if (data?.success && Array.isArray(data.modules)) return data.modules as Module[];
  } catch {
    // keep existing
  }
  return SS_MODULES;
}

async function fetchModuleRawJson(moduleId: number): Promise<JsonQuestion[]> {
  const res = await fetch(`/api/modules/${moduleId}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return data as JsonQuestion[];
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

export function clearModuleDataCache(_moduleId?: number): void {
  // No-op — caches were removed. Kept for backwards compatibility.
}