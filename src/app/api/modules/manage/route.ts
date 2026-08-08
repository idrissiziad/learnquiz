import { NextResponse } from 'next/server';
import { normalizeJson } from '@/data/modules';
import {
  listModules,
  saveModules,
  getModuleById,
  getModuleContent,
  deleteModuleContent,
  type StoredModule,
} from '@/lib/storage';
import { errMsg } from '@/lib/module-config';

interface Registered {
  id: number;
  title: string;
  json_filename: string;
  exists: boolean;
  questionCount: number;
}

interface ManageScan {
  registered: Registered[];
  orphans: { json_filename: string; questionCount: number }[];
  missing: Registered[];
}

export async function GET() {
  try {
    const scan: ManageScan = { registered: [], orphans: [], missing: [] };
    const modules = await listModules();

    const results = await Promise.all(
      modules.map(async (mod) => {
        const questions = await getModuleContent(mod.json_filename);
        const questionCount = normalizeJson(questions).length;
        return { mod, exists: true, questionCount };
      })
    );

    for (const { mod, exists, questionCount } of results) {
      const entry: Registered = {
        id: mod.id,
        title: mod.title,
        json_filename: mod.json_filename,
        exists,
        questionCount,
      };
      scan.registered.push(entry);
    }

    return NextResponse.json({ success: true, scan });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}

interface ManageBody {
  action: 'sync' | 'remove';
  moduleId?: number;
  deleteFile?: boolean;
}

export async function POST(request: Request) {
  let body: ManageBody;
  try {
    body = (await request.json()) as ManageBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action;

  try {
    if (action === 'remove') {
      const id = Number(body.moduleId);
      const mod = await getModuleById(id);
      if (!mod) {
        return NextResponse.json({ success: false, error: 'Module not found.' }, { status: 404 });
      }

      const modules = (await listModules()).filter((m) => m.id !== id);
      await saveModules(modules);

      if (body.deleteFile) {
        await deleteModuleContent(mod.json_filename);
      }

      return NextResponse.json({
        success: true,
        action: 'remove',
        moduleId: id,
        moduleTitle: mod.title,
        deletedFile: !!body.deleteFile,
      });
    }

    if (action === 'sync') {
      // With server-side storage, there are no orphan files on disk to reconcile.
      // Sync is a no-op: every module in the index already maps to stored content.
      return NextResponse.json({
        success: true,
        action: 'sync',
        added: [] as StoredModule[],
        removed: [],
        message: 'Tout est déjà synchronisé.',
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}