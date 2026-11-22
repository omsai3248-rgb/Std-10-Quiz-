import type { QuizChapter } from '../../types/models';
import { hindiVyakaran29To35Chapters } from './hindiVyakaran29To35';
import { hindiVyakaran36To45Chapters } from './hindiVyakaran36To45';

export const hindiChapters: QuizChapter[] = [
  ...hindiVyakaran29To35Chapters,
  ...hindiVyakaran36To45Chapters,
];
