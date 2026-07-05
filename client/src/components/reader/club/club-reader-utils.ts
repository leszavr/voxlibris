export interface ClubReaderInnerProps {
  clubId: string;
  bookId: string;
}

export interface PendingScrollRestore {
  chapter: number;
  positionRaw: string;
}

export function normalizeReaderChapter(chapter: number | null | undefined): number {
  return typeof chapter === "number" && Number.isFinite(chapter) && chapter > 0 ? chapter : 1;
}
