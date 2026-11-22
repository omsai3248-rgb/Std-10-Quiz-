import type { QuizChapter } from '../../types/models';
import { gujaratiVibhagABChapters } from './gujaratiVibhagAB';
import { gujaratiVyakaran33To36Chapters } from './gujaratiVyakaran33To36';
import { gujaratiVyakaran37To40Chapters } from './gujaratiVyakaran37To40';
import { gujaratiVyakaran41To46Chapters } from './gujaratiVyakaran41To46';
import { gujaratiVyakaran47To52Chapters } from './gujaratiVyakaran47To52';

export const gujaratiChapters: QuizChapter[] = [
  ...gujaratiVibhagABChapters,
  ...gujaratiVyakaran33To36Chapters,
  ...gujaratiVyakaran37To40Chapters,
  ...gujaratiVyakaran41To46Chapters,
  ...gujaratiVyakaran47To52Chapters,
];
