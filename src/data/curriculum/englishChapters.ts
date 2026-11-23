import type { QuizChapter } from '../../types/models';
import { englishTrueFalseChapter } from './englishSectionA';
import {
  englishConversationChapter,
  englishMatchingFunctionsChapter,
} from './englishSectionC1';
import {
  englishCompleteSentencesChapter,
  englishNearestMeaningChapter,
} from './englishSectionC2';
import { englishVocabParagraphChapter } from './englishSectionC3';
import { englishIndirectNarrationChapter } from './englishSectionD1';
import {
  englishConjunctionsChapter,
  englishGrammarBlanksChapter,
} from './englishSectionD2';
import { englishFrameQuestionsChapter } from './englishSectionD3';

// GSEB Std 10 English (Second Language) — Exact PDF Chapter Order
// Section A: Q. 12 to 15 (48)
// Section C: Q. 33 to 35 (15 Sets), Q. 36 to 38 (46), Q. 39 to 41 (46), Q. 42 (45), Q. 43 to 45 (48)
// Section D: Q. 46 (45), Q. 47 to 49 (48), Q. 50 (45), Q. 53 to 55 (48)
// Total = 10 Question Sections • 434 Interactive Quiz Items
export const englishChapters: QuizChapter[] = [
  englishTrueFalseChapter,
  englishMatchingFunctionsChapter,
  englishConversationChapter,
  englishCompleteSentencesChapter,
  englishVocabParagraphChapter,
  englishNearestMeaningChapter,
  englishIndirectNarrationChapter,
  englishConjunctionsChapter,
  englishGrammarBlanksChapter,
  englishFrameQuestionsChapter,
];
