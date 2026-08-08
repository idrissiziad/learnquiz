import { NextRequest, NextResponse } from 'next/server';
import { loadUserProgress, saveUserProgress } from '@/lib/user-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, answers } = body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { error: 'Champs requis manquants' },
        { status: 400 }
      );
    }

    const userId = user_id || 'default_user';
    const progress = await loadUserProgress(userId);

    for (const answer of answers) {
      const { module_id, question_id, is_correct } = answer;

      const moduleKey = `module_${module_id}`;
      if (!progress[moduleKey]) {
        progress[moduleKey] = {};
      }
      progress[moduleKey][question_id] = {
        is_correct,
        answered_at: new Date().toISOString()
      };
    }

    await saveUserProgress(userId, progress);

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error('Batch answer error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}