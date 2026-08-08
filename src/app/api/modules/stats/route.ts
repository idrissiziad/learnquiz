import { NextResponse } from 'next/server';
import { normalizeJson, extractChaptersFromQuestions } from '@/data/modules';
import { listModules, getModuleContent } from '@/lib/storage';

export async function GET() {
  try {
    const modules = await listModules();
    const results = await Promise.all(
      modules.map(async (mod) => {
        if (!mod.json_filename) {
          return { id: mod.id, questionCount: 0, chapterCount: 0 };
        }
        try {
          const raw = await getModuleContent(mod.json_filename);
          const jsonQuestions = normalizeJson(raw);
          const chapters = extractChaptersFromQuestions(jsonQuestions);
          return {
            id: mod.id,
            questionCount: jsonQuestions.length,
            chapterCount: chapters.length,
          };
        } catch {
          return { id: mod.id, questionCount: 0, chapterCount: 0 };
        }
      })
    );

    const stats: Record<number, { questionCount: number; chapterCount: number }> = {};
    for (const result of results) {
      stats[result.id] = {
        questionCount: result.questionCount,
        chapterCount: result.chapterCount,
      };
    }

    return new NextResponse(JSON.stringify({ success: true, stats }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ success: false, stats: {} });
  }
}