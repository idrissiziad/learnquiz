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

interface CachedEntry {
  questions: JsonQuestion[];
  version: number;
}

const dataCache = new Map<number, CachedEntry>();
const moduleVersions = new Map<number, number>();
let modulesPromise: Promise<Module[]> | null = null;
let modulesState: Module[] = SS_MODULES;
const modulesListeners = new Set<(m: Module[]) => void>();

const CACHE_BUST_KEY = 'learnquiz:cache-bust';

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CACHE_BUST_KEY) {
      // Don't clear dataCache — the fresh modules list updates moduleVersions,
      // and per-module comparisons decide which entries need refetching.
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
        moduleVersions.clear();
        for (const m of list) moduleVersions.set(m.id, m.version ?? 0);
        // Drop cache entries for modules that no longer exist.
        for (const id of Array.from(dataCache.keys())) {
          if (!moduleVersions.has(id)) dataCache.delete(id);
        }
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
  const cached = dataCache.get(moduleId);
  const currentVersion = moduleVersions.get(moduleId);

  if (cached && currentVersion !== undefined && cached.version === currentVersion) {
    return cached.questions;
  }

  try {
    const res = await fetch(`/api/modules/${moduleId}`, { cache: 'no-store' });
    if (!res.ok) return cached ? cached.questions : [];
    const data = (await res.json()) as JsonQuestion[];
    const versionHeader = res.headers.get('X-Module-Version');
    const version = versionHeader != null ? Number(versionHeader) : (currentVersion ?? 0);
    dataCache.set(moduleId, { questions: data, version });
    if (Number.isFinite(version)) moduleVersions.set(moduleId, version);
    return data;
  } catch {
    // Network failure — serve stale cache if we have it, else nothing.
    return cached ? cached.questions : [];
  }
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