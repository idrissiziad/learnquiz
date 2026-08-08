import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import type { JsonQuestion } from '@/data/modules';

export interface StoredModule {
  id: number;
  title: string;
  subtitle?: string;
  description: string;
  levels: string[];
  gradient: string;
  json_filename: string;
  version?: number;
}

const MODULES_KEY = 'learnquiz:modules';
const VERSIONS_HASH = 'learnquiz:content_versions';
const VERSIONS_FILE = 'learnquiz_content_versions.json';
const contentKey = (slug: string) => `learnquiz:content:${slug}`;
const progressKey = (userId: string) => `learnquiz:progress:${userId}`;

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

function isServerless(): boolean {
  return !!process.env.VERCEL || process.cwd().startsWith('/var/task') || !!process.env.LAMBDA_TASK_ROOT;
}

function backend(): 'redis' | 'fs' {
  return redisConfig() ? 'redis' : 'fs';
}

const READONLY_FS_HINT =
  'Serverless host detected with no Redis configured. Set KV_REST_API_URL (or UPSTASH_REDIS_REST_URL) and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN) from your Upstash Redis database.';

export { backend as STORAGE_BACKEND };

async function redis(cmd: string, ...args: (string | number)[]): Promise<unknown> {
  const cfg = redisConfig();
  if (!cfg) throw new Error('Redis not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify([cmd, ...args]),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis ${cmd} failed: ${res.status} ${await res.text()}`);
  const body = await res.json() as { result?: unknown };
  return body.result;
}

async function getJson(key: string): Promise<unknown> {
  if (backend() === 'redis') {
    const raw = await redis('GET', key) as string | null;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  try {
    const raw = await readFile(join(process.cwd(), 'data', `${key.replace(/:/g, '_')}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

async function setJson(key: string, value: unknown): Promise<void> {
  if (backend() === 'redis') {
    await redis('SET', key, JSON.stringify(value));
    return;
  }
  if (isServerless()) throw new Error(READONLY_FS_HINT);
  const filePath = join(process.cwd(), 'data', `${key.replace(/:/g, '_')}.json`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

async function delKey(key: string): Promise<void> {
  if (backend() === 'redis') {
    await redis('DEL', key);
    return;
  }
  if (isServerless()) throw new Error(READONLY_FS_HINT);
  try { await unlink(join(process.cwd(), 'data', `${key.replace(/:/g, '_')}.json`)); } catch { /* ignore */ }
}

async function getAllContentVersions(): Promise<Record<string, number>> {
  if (backend() === 'redis') {
    const raw = await redis('HGETALL', VERSIONS_HASH) as Record<string, string> | null;
    if (!raw) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }
  try {
    const raw = await readFile(join(process.cwd(), 'data', VERSIONS_FILE), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

async function bumpContentVersion(slug: string): Promise<number> {
  if (backend() === 'redis') {
    const next = await redis('HINCRBY', VERSIONS_HASH, slug, 1);
    return Number(next);
  }
  if (isServerless()) throw new Error(READONLY_FS_HINT);
  const filePath = join(process.cwd(), 'data', VERSIONS_FILE);
  let versions: Record<string, number> = {};
  try {
    versions = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, number>;
  } catch { /* first run */ }
  const next = (versions[slug] ?? 0) + 1;
  versions[slug] = next;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(versions, null, 2), 'utf-8');
  return next;
}

async function removeContentVersion(slug: string): Promise<void> {
  if (backend() === 'redis') {
    await redis('HDEL', VERSIONS_HASH, slug);
    return;
  }
  if (isServerless()) return;
  try {
    const filePath = join(process.cwd(), 'data', VERSIONS_FILE);
    const versions = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, number>;
    delete versions[slug];
    await writeFile(filePath, JSON.stringify(versions, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

export async function listModules(): Promise<StoredModule[]> {
  const stored = await getJson(MODULES_KEY);
  if (Array.isArray(stored)) {
    const list = stored as StoredModule[];
    const versions = await getAllContentVersions();
    for (const m of list) m.version = versions[m.json_filename] ?? 0;
    return list;
  }

  const seed = await seedFromDisk();
  if (seed.length) await setJson(MODULES_KEY, seed);
  return seed;
}

async function seedFromDisk(): Promise<StoredModule[]> {
  try {
    const dir = join(process.cwd(), 'src', 'data', 'modules');
    const entries = await readdir(dir);
    const jsonFiles = entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));

    const seed: StoredModule[] = [];
    let id = 1;
    for (const f of jsonFiles) {
      const title = f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      seed.push({
        id: id++,
        title,
        subtitle: title,
        description: '',
        levels: ['1ère année'],
        gradient: 'from-blue-400 to-blue-600',
        json_filename: f,
      });
    }
    return seed;
  } catch {
    return [];
  }
}

export async function saveModules(list: StoredModule[]): Promise<void> {
  await setJson(MODULES_KEY, list);
}

export async function getModuleByFilename(slug: string): Promise<StoredModule | undefined> {
  const list = await listModules();
  return list.find((m) => m.json_filename === slug);
}

export async function getModuleById(id: number): Promise<StoredModule | undefined> {
  const list = await listModules();
  return list.find((m) => m.id === id);
}

const NEXT_ID_KEY = 'learnquiz:next_module_id';

export async function getNextModuleId(): Promise<number> {
  if (backend() === 'redis') {
    const list = await listModules();
    const maxId = list.length ? Math.max(...list.map((m) => m.id)) : 0;
    await redis('SETNX', NEXT_ID_KEY, maxId);
    const next = await redis('INCR', NEXT_ID_KEY);
    return Number(next);
  }
  const list = await listModules();
  return list.length ? Math.max(...list.map((m) => m.id)) + 1 : 1;
}

function readJsonContent(value: unknown): JsonQuestion[] {
  if (Array.isArray(value)) return value as JsonQuestion[];
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).questions)) {
    return (value as Record<string, unknown>).questions as JsonQuestion[];
  }
  return [];
}

export async function getModuleContent(slug: string): Promise<JsonQuestion[]> {
  const value = await getJson(contentKey(slug));
  return readJsonContent(value);
}

export async function saveModuleContent(slug: string, questions: JsonQuestion[]): Promise<number> {
  await setJson(contentKey(slug), questions);
  return bumpContentVersion(slug);
}

export async function deleteModuleContent(slug: string): Promise<void> {
  await delKey(contentKey(slug));
  await removeContentVersion(slug);
}

export async function loadUserProgress(userId: string): Promise<Record<string, any>> {
  const value = await getJson(progressKey(userId));
  if (value && typeof value === 'object') return value as Record<string, any>;
  return {};
}

export async function saveUserProgress(userId: string, progress: Record<string, any>): Promise<void> {
  await setJson(progressKey(userId), progress);
}