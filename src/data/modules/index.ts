export interface Module {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  levels: string[];
  gradient: string;
  json_filename?: string;
  icon?: string;
  version?: number;
}

export interface JsonQuestion {
  YearAsked: string;
  Subtopic: string;
  QuestionText: string;
  QuestionImage?: string;
  Choice_A_Text: string;
  Choice_A_isCorrect: boolean;
  Choice_A_Explanation: string;
  Choice_A_Image?: string | string[];
  Choice_B_Text: string;
  Choice_B_isCorrect: boolean;
  Choice_B_Explanation: string;
  Choice_B_Image?: string | string[];
  Choice_C_Text: string;
  Choice_C_isCorrect: boolean;
  Choice_C_Explanation: string;
  Choice_C_Image?: string | string[];
  Choice_D_Text: string;
  Choice_D_isCorrect: boolean;
  Choice_D_Explanation: string;
  Choice_D_Image?: string | string[];
  Choice_E_Text: string;
  Choice_E_isCorrect: boolean;
  Choice_E_Explanation: string;
  Choice_E_Image?: string | string[];
  OverallExplanation: string;
  IsChapterStart?: boolean;
  ChapterName?: string;
  ChapterColor?: string;
  Confirmed?: boolean;
}

export interface Question {
  id: string;
  question: string;
  questionImage?: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  chapter?: string;
  year?: string;
  isMultipleChoice?: boolean;
  correctAnswers?: number[];
  answerExplanations?: string[];
  overallExplanation?: string;
  confirmed?: boolean;
  optionImages?: string[];
}

export interface Chapter {
  id: number;
  name: string;
  questionCount: number;
  color: string;
  startPosition: number;
}

export interface ModuleWithQuestions extends Module {
  questions: Question[];
}

// Empty seed for the public template. New modules are created at runtime via
// the dashboard and persisted server-side (Redis in prod, filesystem in dev).
// See src/lib/storage.ts.
export const modules: Module[] = [];

export const getModuleById = (id: number): Module | undefined => {
  return modules.find(module => module.id === id);
};

export const extractChaptersFromQuestions = (questions: JsonQuestion[]): Chapter[] => {
  const chapters: Chapter[] = [];
  const subtopicGroups: { [subtopic: string]: { questions: JsonQuestion[], startIndex: number } } = {};
  
  questions.forEach((question, index) => {
    const subtopic = question.Subtopic || 'Non classé';
    if (!subtopicGroups[subtopic]) {
      subtopicGroups[subtopic] = {
        questions: [],
        startIndex: index
      };
    }
    subtopicGroups[subtopic].questions.push(question);
  });
  
  Object.entries(subtopicGroups).forEach(([subtopic, group]) => {
    if (group.questions.length > 0) {
      chapters.push({
        id: 0,
        name: subtopic,
        color: "#3B82F6",
        startPosition: group.startIndex,
        questionCount: group.questions.length
      });
    }
  });
  
  chapters.sort((a, b) => b.questionCount - a.questionCount);
  
  chapters.forEach((chapter, index) => {
    chapter.id = index + 1;
  });
  
  return chapters;
};

export const normalizeJson = (data: any): JsonQuestion[] => {
  const questions = Array.isArray(data) ? data : (data?.questions && Array.isArray(data.questions) ? data.questions : []);
  return questions.map((item: any) => ({
    YearAsked: item.YearAsked || '',
    Subtopic: item.Subtopic || '',
    QuestionText: item.QuestionText || '',
    QuestionImage: item.QuestionImage,
    Choice_A_Text: item.Choice_A_Text || '',
    Choice_A_isCorrect: !!item.Choice_A_isCorrect,
    Choice_A_Explanation: item.Choice_A_Explanation || '',
    Choice_A_Image: item.Choice_A_Image,
    Choice_B_Text: item.Choice_B_Text || '',
    Choice_B_isCorrect: !!item.Choice_B_isCorrect,
    Choice_B_Explanation: item.Choice_B_Explanation || '',
    Choice_B_Image: item.Choice_B_Image,
    Choice_C_Text: item.Choice_C_Text || '',
    Choice_C_isCorrect: !!item.Choice_C_isCorrect,
    Choice_C_Explanation: item.Choice_C_Explanation || '',
    Choice_C_Image: item.Choice_C_Image,
    Choice_D_Text: item.Choice_D_Text || '',
    Choice_D_isCorrect: !!item.Choice_D_isCorrect,
    Choice_D_Explanation: item.Choice_D_Explanation || '',
    Choice_D_Image: item.Choice_D_Image,
    Choice_E_Text: item.Choice_E_Text || '',
    Choice_E_isCorrect: !!item.Choice_E_isCorrect,
    Choice_E_Explanation: item.Choice_E_Explanation || '',
    Choice_E_Image: item.Choice_E_Image,
    OverallExplanation: item.OverallExplanation || '',
    IsChapterStart: item.IsChapterStart,
    ChapterName: item.ChapterName,
    ChapterColor: item.ChapterColor,
    Confirmed: item.Confirmed,
  }));
};

export const jsonQuestionsToQuestions = (jsonQuestions: JsonQuestion[]): Question[] => {
  return jsonQuestions.map((q, index) => {
    const allOptions = [
      { text: q.Choice_A_Text, isCorrect: q.Choice_A_isCorrect, explanation: q.Choice_A_Explanation, image: q.Choice_A_Image || '' },
      { text: q.Choice_B_Text, isCorrect: q.Choice_B_isCorrect, explanation: q.Choice_B_Explanation, image: q.Choice_B_Image || '' },
      { text: q.Choice_C_Text, isCorrect: q.Choice_C_isCorrect, explanation: q.Choice_C_Explanation, image: q.Choice_C_Image || '' },
      { text: q.Choice_D_Text, isCorrect: q.Choice_D_isCorrect, explanation: q.Choice_D_Explanation, image: q.Choice_D_Image || '' },
      { text: q.Choice_E_Text, isCorrect: q.Choice_E_isCorrect, explanation: q.Choice_E_Explanation, image: q.Choice_E_Image || '' }
    ];
    
    const validOptions = allOptions.filter(option => option.text && option.text.trim() !== '');
    
    const options = validOptions.map(option => option.text);
    const correctAnswers: number[] = [];
    const answerExplanations: string[] = [];
    const optionImages: string[] = [];
    
    validOptions.forEach((option, index) => {
      if (option.isCorrect) correctAnswers.push(index);
      answerExplanations.push(option.explanation);
      optionImages.push(Array.isArray(option.image) ? option.image.join(',') : option.image);
    });
    
    return {
      id: index.toString(),
      question: q.QuestionText,
      questionImage: q.QuestionImage,
      options,
      correctAnswer: correctAnswers.length > 0 ? correctAnswers[0] : 0,
      explanation: q.OverallExplanation || '',
      chapter: q.Subtopic,
      year: q.YearAsked,
      isMultipleChoice: correctAnswers.length > 1,
      correctAnswers,
      answerExplanations,
      overallExplanation: q.OverallExplanation || '',
      confirmed: q.Confirmed,
      optionImages
    };
  });
};

export const getAllModules = (): Module[] => {
  return modules;
};