import { NextResponse } from 'next/server';
import { normalizeJson, JsonQuestion } from '@/data/modules';
import {
  listModules,
  saveModules,
  getModuleById,
  getModuleContent,
  saveModuleContent,
  getNextModuleId,
  type StoredModule,
} from '@/lib/storage';
import {
  slugify,
  LEVELS,
  GRADIENTS,
  errMsg,
} from '@/lib/module-config';

function coerceQuestions(input: unknown, subtopic: string): JsonQuestion[] {
  let arr: unknown[];
  if (Array.isArray(input)) {
    arr = input;
  } else if (input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).questions)) {
    arr = (input as Record<string, unknown>).questions as unknown[];
  } else {
    throw new Error('Expected a JSON array of questions.');
  }
  return arr.map((item) => {
    const normalized = normalizeJson([item])[0];
    normalized.Subtopic = subtopic;
    return normalized;
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const mode: string = typeof body?.mode === 'string' ? body.mode : 'new';
  const title: string = typeof body?.title === 'string' ? body.title.trim() : '';
  const rawQuestions = body?.questions;

  if (!title) {
    return NextResponse.json({ success: false, error: 'Title is required.' }, { status: 400 });
  }
  if (!rawQuestions) {
    return NextResponse.json({ success: false, error: 'Questions are required.' }, { status: 400 });
  }

  let questions: JsonQuestion[];
  try {
    questions = coerceQuestions(rawQuestions, title);
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) || 'Invalid questions payload.' }, { status: 400 });
  }

  if (!questions.length) {
    return NextResponse.json({ success: false, error: 'No questions found in payload.' }, { status: 400 });
  }

  try {
    if (mode === 'append') {
      const moduleId = Number(body?.moduleId);
      const mod = await getModuleById(moduleId);
      if (!mod) {
        return NextResponse.json({ success: false, error: 'Module not found.' }, { status: 404 });
      }

      const existing = await getModuleContent(mod.json_filename);
      existing.push(...questions);
      await saveModuleContent(mod.json_filename, existing);

      return NextResponse.json({
        success: true,
        mode: 'append',
        moduleId: mod.id,
        moduleTitle: mod.title,
        added: questions.length,
        total: existing.length,
      });
    }

    const description: string = typeof body?.description === 'string' ? body.description : '';
    let levels: string[] = Array.isArray((body as Record<string, unknown>)?.levels)
      ? ((body as Record<string, unknown>).levels as unknown[]).filter(
          (l: unknown): l is string => typeof l === 'string' && LEVELS.includes(l)
        )
      : [];
    if (!levels.length) levels = ['1ère année'];

    let gradient: string = typeof body?.gradient === 'string' ? body.gradient : '';
    if (!GRADIENTS.includes(gradient)) gradient = GRADIENTS[0];

    const baseSlug = slugify(title);
    const id = await getNextModuleId();
    const modules = await listModules();
    const taken = new Set(modules.map((m) => m.json_filename));
    let json_filename = baseSlug || `module_${id}`;
    let suffix = 0;
    let candidate = json_filename;
    while (taken.has(candidate)) {
      suffix += 1;
      candidate = `${json_filename}_${suffix}`;
    }
    json_filename = candidate;

    await saveModuleContent(json_filename, questions);

    const newModule: StoredModule = {
      id,
      title,
      subtitle: title,
      description,
      levels,
      gradient,
      json_filename,
    };
    await saveModules([...modules, newModule]);

    return NextResponse.json({
      success: true,
      mode: 'new',
      moduleId: id,
      moduleTitle: title,
      filename: `${json_filename}.json`,
      added: questions.length,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: errMsg(e) || 'Failed to write module data.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    levels: LEVELS,
    gradients: GRADIENTS,
  });
}