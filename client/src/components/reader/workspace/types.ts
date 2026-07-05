export interface Chapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

export interface ProcessedBookData {
  title: string;
  chapters?: Chapter[];
  content?: string;
  totalChapters: number;
  isPersonalBook: boolean;
}

export interface PendingScrollRestore {
  chapter: number;
  positionRaw: string;
}
