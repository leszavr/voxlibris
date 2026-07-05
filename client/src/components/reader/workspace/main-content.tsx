import { Button } from "@/components/ui/button";

import { ContentRenderer } from "../ContentRenderer";
import type { ProcessedBookData } from "./types";

export function ReaderMainContent({
  contentLoading,
  currentChapterContent,
  currentChapter,
  bookData,
  setCurrentChapter,
  onMarkAsRead
}: Readonly<{
  contentLoading: boolean;
  currentChapterContent: string;
  currentChapter: number | null;
  bookData: ProcessedBookData;
  setCurrentChapter: (chapter: number) => void;
  onMarkAsRead: () => void;
}>) {
  if (contentLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }
  if (currentChapterContent) {
    const chapter = currentChapter ?? 1;
    return (
      <>
        <ContentRenderer content={currentChapterContent} />
        <div className="flex flex-wrap justify-between items-center gap-2 mt-12 pt-8 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentChapter(Math.max(1, chapter - 1))}
            disabled={chapter <= 1}
            className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
          >
            ← Пред.
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground order-first sm:order-none w-full sm:w-auto text-center sm:text-left">
            Глава {chapter} из {bookData.totalChapters}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentChapter(Math.min(bookData.totalChapters, chapter + 1))}
            disabled={chapter >= bookData.totalChapters}
            className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
          >
            След. →
          </Button>
        </div>
        {chapter === bookData.totalChapters && (
          <div className="mt-6 flex justify-end">
            <Button variant="default" onClick={onMarkAsRead}>
              Отметить как прочитанное
            </Button>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Контент не найден</p>
    </div>
  );
}
