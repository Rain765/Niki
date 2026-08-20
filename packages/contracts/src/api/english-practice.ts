export type EnglishPracticeLevel = 'A1' | 'A2' | 'B1';

export interface EnglishPracticeCatalogItem {
  id: string;
  number: number;
  title: string;
  englishTitle: string;
  description: string;
  level: EnglishPracticeLevel;
  available: boolean;
  turnCount: number | null;
}

export interface EnglishPracticeCatalogResponse {
  scenarios: EnglishPracticeCatalogItem[];
}

export interface EnglishPracticeDialogueLine {
  id: string;
  speaker: 'A' | 'B';
  english: string;
  chinese: string;
}

export interface EnglishPracticeLessonResponse {
  lesson: EnglishPracticeCatalogItem & {
    dialogue: EnglishPracticeDialogueLine[];
  };
}

export interface EnglishPracticeProgress {
  listenedLineIds: string[];
  favorites: string[];
  sentenceOrderCompleted: boolean;
  shadowingCompleted: boolean;
  rolePlayCompleted: boolean;
  updatedAt: number;
}

export type EnglishPracticeProgressUpdate = Partial<Omit<EnglishPracticeProgress, 'updatedAt'>>;

export interface EnglishPracticeProgressResponse {
  progress: EnglishPracticeProgress;
}
