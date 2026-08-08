import { NextResponse } from 'next/server';
import { getModuleById, getModuleContent } from '@/lib/storage';
import { normalizeJson } from '@/data/modules';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mod = await getModuleById(Number(id));

  if (!mod) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }

  try {
    const raw = await getModuleContent(mod.json_filename);
    const jsonQuestions = normalizeJson(raw);

    return new NextResponse(JSON.stringify(jsonQuestions), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load module' }, { status: 500 });
  }
}