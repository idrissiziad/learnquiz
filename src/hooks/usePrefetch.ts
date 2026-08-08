'use client';

import { useRef } from 'react';
import { preloadModuleData } from '@/data/modules/client';

export function usePrefetchOnHover() {
  const prefetchModule = async (moduleId: number) => {
    try {
      await preloadModuleData(moduleId);
    } catch {}
  };

  return { prefetchModule };
}

export function usePrefetchProgress(getAllProgress: () => Promise<Record<string, unknown>>) {
  const prefetched = useRef(false);
  const prefetchInProgress = useRef(false);

  const prefetchProgress = async () => {
    if (prefetched.current || prefetchInProgress.current) return;
    prefetchInProgress.current = true;
    try {
      await getAllProgress();
      prefetched.current = true;
    } catch {} finally {
      prefetchInProgress.current = false;
    }
  };

  return { prefetchProgress };
}