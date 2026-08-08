import { NextResponse } from 'next/server';
import { normalizeJson, JsonQuestion } from '@/data/modules';
import { getModuleById, getModuleContent, saveModuleContent } from '@/lib/storage';
import { errMsg } from '@/lib/module-config';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

interface EditChoice {
  text: string;
  isCorrect: boolean;
  explanation: string;
  image?: string;
}

interface EditBody {
  moduleId?: number;
  questionIndex?: number;
  questionText?: string;
  questionImage?: string;
  overallExplanation?: string;
  yearAsked?: string;
  subtopic?: string;
  confirmed?: boolean;
  choices?: EditChoice[];
}

export async function POST(request: Request) {
  let body: EditBody;
  try {
    body = (await request.json()) as EditBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const moduleId = Number(body.moduleId);
  const mod = await getModuleById(moduleId);
  if (!mod) {
    return NextResponse.json({ success: false, error: 'Module not found.' }, { status: 404 });
  }

  const questionIndex = Number(body.questionIndex);
  if (!Number.isFinite(questionIndex) || questionIndex < 0) {
    return NextResponse.json({ success: false, error: 'A valid questionIndex is required.' }, { status: 400 });
  }

  const choices = Array.isArray(body.choices) ? body.choices : [];
  if (choices.length === 0) {
    return NextResponse.json({ success: false, error: 'At least one choice is required.' }, { status: 400 });
  }
  if (choices.length > 5) {
    return NextResponse.json({ success: false, error: 'A question may have at most 5 choices.' }, { status: 400 });
  }
  if (!choices.some((c) => c && c.isCorrect)) {
    return NextResponse.json({ success: false, error: 'At least one correct choice is required.' }, { status: 400 });
  }

  try {
    const arr: JsonQuestion[] = await getModuleContent(mod.json_filename);
    if (questionIndex >= arr.length) {
      return NextResponse.json({ success: false, error: 'questionIndex out of range.' }, { status: 400 });
    }

    const existing: Record<string, unknown> = (arr[questionIndex] as unknown) as Record<string, unknown>;
    const updated: Record<string, unknown> = { ...existing };

    updated.QuestionText =
      typeof body.questionText === 'string' ? body.questionText : (existing.QuestionText ?? '');
    updated.QuestionImage =
      typeof body.questionImage === 'string' ? body.questionImage : (existing.QuestionImage ?? '');
    updated.OverallExplanation =
      typeof body.overallExplanation === 'string' ? body.overallExplanation : (existing.OverallExplanation ?? '');
    updated.YearAsked =
      typeof body.yearAsked === 'string' ? body.yearAsked : (existing.YearAsked ?? '');
    updated.Subtopic =
      typeof body.subtopic === 'string' ? body.subtopic : (existing.Subtopic ?? '');
    updated.Confirmed =
      typeof body.confirmed === 'boolean' ? body.confirmed : (existing.Confirmed ?? false);

    const choicesToWrite = choices.slice();
    if (choicesToWrite.length === 1 && !choicesToWrite[0].isCorrect) {
      choicesToWrite[0].isCorrect = true;
    }

    LETTERS.forEach((letter, i) => {
      const choice = choicesToWrite[i];
      if (choice) {
        updated[`Choice_${letter}_Text`] = choice.text ?? '';
        updated[`Choice_${letter}_isCorrect`] = !!choice.isCorrect;
        updated[`Choice_${letter}_Explanation`] = choice.explanation ?? '';
        const img = choice.image ?? '';
        updated[`Choice_${letter}_Image`] = img || undefined;
      } else {
        updated[`Choice_${letter}_Text`] = '';
        updated[`Choice_${letter}_isCorrect`] = false;
        updated[`Choice_${letter}_Explanation`] = '';
        updated[`Choice_${letter}_Image`] = undefined;
      }
    });

    arr[questionIndex] = updated as unknown as JsonQuestion;
    await saveModuleContent(mod.json_filename, arr);

    const normalized = normalizeJson([updated])[0];

    return NextResponse.json({
      success: true,
      moduleId: mod.id,
      questionIndex,
      question: normalized,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}