export type { StoredModule } from '@/lib/storage';

export const LEVELS = [
  '1ère année',
  '2ème année',
  '3ème année',
  '4ème année',
  '5ème année',
  '6ème année',
];

export const GRADIENTS = [
  'from-blue-400 to-blue-600',
  'from-green-400 to-green-600',
  'from-purple-400 to-purple-600',
  'from-red-400 to-red-600',
  'from-yellow-400 to-yellow-600',
  'from-indigo-400 to-indigo-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
];

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function slugify(s: string): string {
  const base = (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'module';
}