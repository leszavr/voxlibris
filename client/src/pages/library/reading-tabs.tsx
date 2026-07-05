import { Bookmark, BookOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HistoryBookCard } from "@/components/ui/history-book-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { serializeHistoryCompletedAt } from "./utils";

interface HistoryTabProps {
  historyData?: Array<{
    id: string;
    bookTitle: string;
    bookAuthor: string;
    bookCoverUrl?: string | null;
    completedAt?: Date | string | null;
    readingTimeMinutes?: number | null;
  }>;
  clearHistory: {
    mutate: () => void;
    isPending: boolean;
  };
}

interface BookmarksTabProps {
  bookmarksLoading: boolean;
  bookmarks: Array<{
    id: string;
    bookId: string;
    title?: string | null;
    bookTitle?: string | null;
    bookAuthor?: string | null;
    bookCoverUrl?: string | null;
    chapterNumber?: number | null;
    createdAt: string | Date;
    position: string;
  }>;
  fallbackCover: string;
  onOpenBookmark: (bookmark: { bookId: string; position: string }) => void;
  onDeleteBookmark: (bookmark: { id: string; bookId: string }) => void;
  deleteBookmarkPending: boolean;
}

export function HistoryTab({ historyData, clearHistory }: HistoryTabProps) {
  return (
    <TabsContent value="history">
      <div className="space-y-4">
        {historyData?.length === 0 ? (
          <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium">Нет прочитанных книг</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-2">
              Книги, которые вы прочитаете до конца, появятся здесь автоматически.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold">История чтения ({(historyData || []).length})</h2>
              <Button variant="outline" size="sm" onClick={() => clearHistory.mutate()} disabled={clearHistory.isPending} className="w-full sm:w-auto">
                {clearHistory.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Очистить историю
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(historyData || []).map((book) => (
                <HistoryBookCard
                  key={book.id}
                  bookTitle={book.bookTitle}
                  bookAuthor={book.bookAuthor}
                  bookCoverUrl={book.bookCoverUrl ?? undefined}
                  completedAt={serializeHistoryCompletedAt(book.completedAt)}
                  readingTimeMinutes={book.readingTimeMinutes ?? undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </TabsContent>
  );
}

export function BookmarksTab({
  bookmarksLoading,
  bookmarks,
  fallbackCover,
  onOpenBookmark,
  onDeleteBookmark,
  deleteBookmarkPending,
}: BookmarksTabProps) {
  return (
    <TabsContent value="bookmarks">
      {bookmarksLoading ? (
        <BookmarksSkeleton />
      ) : bookmarks.length === 0 ? (
        <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
          <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium">Нет сохраненных закладок</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mt-2">
            Ставьте закладки прямо во время чтения, чтобы быстро возвращаться к важным местам книги.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 sm:flex-row">
              <div className="w-20 h-28 rounded-lg overflow-hidden shadow-sm shrink-0 bg-muted">
                {bookmark.bookCoverUrl ? (
                  <img
                    src={bookmark.bookCoverUrl}
                    alt={bookmark.bookTitle || "Обложка книги"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = fallbackCover;
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold line-clamp-2 break-words">{bookmark.title || "Без названия"}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {bookmark.bookTitle || "Книга"}{bookmark.bookAuthor ? ` • ${bookmark.bookAuthor}` : ""}
                  </p>
                  {bookmark.chapterNumber && <p className="text-sm text-muted-foreground mt-2">Глава {bookmark.chapterNumber}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Создано: {new Date(bookmark.createdAt).toLocaleString("ru-RU")}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button onClick={() => onOpenBookmark(bookmark)} className="w-full sm:w-auto">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Открыть закладку
                  </Button>
                  <Button variant="outline" onClick={() => onDeleteBookmark(bookmark)} disabled={deleteBookmarkPending} className="w-full sm:w-auto">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </TabsContent>
  );
}

function BookmarksSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4">
          <Skeleton className="w-20 h-28 rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
