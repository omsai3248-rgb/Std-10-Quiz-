import type { QuizChapter, QuizSubject, SubjectId } from '../../types/models';
import { mathsChapters } from './mathsChapters';
import { scienceChapters } from './scienceChapters';
import { socialChapters } from './socialChapters';

export const std10Subjects: QuizSubject[] = [
  {
    id: 'maths',
    title: 'ગણિત',
    englishSubtitle: 'Mathematics • ધોરણ ૧૦',
    description: 'વાસ્તવિક સંખ્યાઓ, બહુપદી, સમીકરણ, ત્રિકોણમિતિ અને સંભાવના',
    imageUrl: '/images/img_subject_maths.jpg',
    accentHex: '#1D4ED8',
    chapters: mathsChapters,
  },
  {
    id: 'science',
    title: 'વિજ્ઞાન',
    englishSubtitle: 'Science • ધોરણ ૧૦',
    description: 'રસાયણશાસ્ત્ર, જૈવિક ક્રિયાઓ, પ્રકાશ અને વિદ્યુતના પ્રશ્નો',
    imageUrl: '/images/img_subject_science.jpg',
    accentHex: '#047857',
    chapters: scienceChapters,
  },
  {
    id: 'social_science',
    title: 'સામાજિક વિજ્ઞાન',
    englishSubtitle: 'Social Science • ધોરણ ૧૦',
    description: 'ભારતનો વારસો, ભૂગોળ, સંસાધનો, અર્થશાસ્ત્ર અને નાગરિક',
    imageUrl: '/images/img_subject_social.jpg',
    accentHex: '#B45309',
    chapters: socialChapters,
  },
];

export function findSubject(subjectId: string): QuizSubject | undefined {
  return std10Subjects.find((s) => s.id === (subjectId as SubjectId));
}

export function findChapter(subjectId: string, chapterId: string): QuizChapter | undefined {
  return findSubject(subjectId)?.chapters.find((c) => c.id === chapterId);
}
