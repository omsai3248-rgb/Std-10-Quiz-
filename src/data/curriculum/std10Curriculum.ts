import type { QuizChapter, QuizSubject, SubjectId } from '../../types/models';

export interface SubjectMeta {
  id: SubjectId;
  title: string;
  englishSubtitle: string;
  description: string;
  imageUrl: string;
  accentHex: string;
  chapterCount: number;
  questionCount: number;
}

export const std10SubjectMetas: SubjectMeta[] = [
  {
    id: 'maths',
    title: 'ગણિત',
    englishSubtitle: 'Mathematics • ધોરણ ૧૦',
    description: 'વાસ્તવિક સંખ્યાઓ, બહુપદી, સમીકરણ, ત્રિકોણમિતિ અને સંભાવના',
    imageUrl: '/images/img_subject_maths.jpg',
    accentHex: '#1D4ED8',
    chapterCount: 22,
    questionCount: 478,
  },
  {
    id: 'science',
    title: 'વિજ્ઞાન',
    englishSubtitle: 'Science • ધોરણ ૧૦',
    description: 'રસાયણશાસ્ત્ર, જૈવિક ક્રિયાઓ, પ્રકાશ અને વિદ્યુતના પ્રશ્નો',
    imageUrl: '/images/img_subject_science.jpg',
    accentHex: '#047857',
    chapterCount: 22,
    questionCount: 633,
  },
  {
    id: 'social_science',
    title: 'સામાજિક વિજ્ઞાન',
    englishSubtitle: 'Social Science • ધોરણ ૧૦',
    description: 'ભારતનો વારસો, ભૂગોળ, સંસાધનો, અર્થશાસ્ત્ર અને નાગરિક',
    imageUrl: '/images/img_subject_social.jpg',
    accentHex: '#B45309',
    chapterCount: 23,
    questionCount: 420,
  },
  {
    id: 'gujarati',
    title: 'ગુજરાતી',
    englishSubtitle: 'Gujarati (01 G) • ધોરણ ૧૦',
    description: 'વિભાગ A (ગદ્ય), વિભાગ B (પદ્ય) અને વિભાગ C (વ્યાકરણ) બોર્ડ + પાઠ્યપુસ્તક સંગ્રહ',
    imageUrl: '/images/img_subject_gujarati.jpg',
    accentHex: '#9D174D',
    chapterCount: 30,
    questionCount: 602,
  },
  {
    id: 'hindi',
    title: 'હિન્દી',
    englishSubtitle: 'Hindi (14 • द्वितीय भाषा) • ધોરણ ૧૦',
    description: 'વિભાગ C : સંપૂર્ણ વ્યાકરણ પ્રશ્નબેંક (પ્રશ્ન ક્ર. 29 થી 45 • બોર્ડ + પાઠ્યપુસ્તક)',
    imageUrl: '/images/img_subject_hindi.jpg',
    accentHex: '#C2410C',
    chapterCount: 11,
    questionCount: 158,
  },
];

const subjectCache = new Map<SubjectId, QuizSubject>();
const inflightLoads = new Map<SubjectId, Promise<QuizSubject>>();

async function loadChaptersForSubject(subjectId: SubjectId): Promise<QuizChapter[]> {
  switch (subjectId) {
    case 'maths': {
      const mod = await import('./mathsChapters');
      return mod.mathsChapters;
    }
    case 'science': {
      const mod = await import('./scienceChapters');
      return mod.scienceChapters;
    }
    case 'social_science': {
      const mod = await import('./socialChapters');
      return mod.socialChapters;
    }
    case 'gujarati': {
      const mod = await import('./gujaratiChapters');
      return mod.gujaratiChapters;
    }
    case 'hindi': {
      const mod = await import('./hindiChapters');
      return mod.hindiChapters;
    }
  }
}

export function getCachedSubject(subjectId: string): QuizSubject | undefined {
  return subjectCache.get(subjectId as SubjectId);
}

export function getCachedChapter(subjectId: string, chapterId: string): QuizChapter | undefined {
  return subjectCache.get(subjectId as SubjectId)?.chapters.find((c) => c.id === chapterId);
}

export async function loadSubjectWithChapters(subjectId: SubjectId): Promise<QuizSubject> {
  const cached = subjectCache.get(subjectId);
  if (cached) return cached;

  const existingPromise = inflightLoads.get(subjectId);
  if (existingPromise) return existingPromise;

  const meta = std10SubjectMetas.find((m) => m.id === subjectId);
  if (!meta) {
    throw new Error(`Unknown subject: ${subjectId}`);
  }

  const promise = loadChaptersForSubject(subjectId)
    .then((chapters) => {
      const subject: QuizSubject = {
        id: meta.id,
        title: meta.title,
        englishSubtitle: meta.englishSubtitle,
        description: meta.description,
        imageUrl: meta.imageUrl,
        accentHex: meta.accentHex,
        chapters,
      };
      subjectCache.set(subjectId, subject);
      return subject;
    })
    .finally(() => {
      inflightLoads.delete(subjectId);
    });

  inflightLoads.set(subjectId, promise);
  return promise;
}
