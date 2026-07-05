import { Book, BookOpen, CalendarClock, Clock, Edit, Eye, Library as LibraryIcon, MoreVertical, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import type { PersonalLibraryBookCardProps } from "./types";
import { getPersonalBookFormatLabel } from "./utils";

export function PersonalLibraryBookCard({
  book,
  fallbackCover,
  formatBookGenres,
  onRead,
  onEdit,
  onDelete,
  onMarkAsCompleted,
  onPlan,
  onRecommend,
  onNotInterested,
  canMarkAsCompleted,
  markAsCompletedPending,
}: Readonly<PersonalLibraryBookCardProps>) {
  const genres = formatBookGenres(book);

  return (
    <div className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 sm:flex-row sm:gap-6 sm:p-6">
      <div className="w-full sm:w-48 aspect-[2/3] shrink-0 rounded-lg overflow-hidden shadow-md">
        <img
          src={book.coverUrl || fallbackCover}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = fallbackCover;
          }}
        />
      </div>

      <div className="flex-1 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-serif font-bold sm:text-xl">{book.title}</h3>
              <p className="text-muted-foreground">{book.author}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRead(book)} className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Читать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(book)} className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(book)} className="text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Удалить из библиотеки
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-accent-foreground/80 font-medium bg-accent/10 w-fit px-2 py-1 rounded">
            <LibraryIcon className="w-3.5 h-3.5" />
            {getPersonalBookFormatLabel(book)}
          </div>

          {genres && <div className="mt-2 text-xs text-muted-foreground">Жанры: {genres}</div>}

          {book.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{book.description}</p>}
        </div>

        <div className="space-y-2">
          {book.progress !== undefined && book.progress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Прогресс</span>
                <span className="font-medium">{book.progress}%</span>
              </div>
              <Progress value={book.progress} className="h-2" />
            </div>
          )}

          <div className="flex justify-end text-sm">
            <span className="text-muted-foreground">{book.language && <span className="uppercase">{book.language}</span>}</span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Добавлено: {new Date(book.createdAt ?? book.uploadedAt).toLocaleDateString("ru-RU")}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
          <Button className="flex-1 gap-2 sm:flex-none" onClick={() => onRead(book)}>
            <Book className="w-4 h-4" /> Читать
          </Button>
          {canMarkAsCompleted && (
            <Button
              variant="secondary"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => onMarkAsCompleted(book)}
              disabled={markAsCompletedPending}
            >
              <BookOpen className="w-4 h-4" />
              {markAsCompletedPending ? "Сохраняем..." : "Прочитано"}
            </Button>
          )}
          <Button variant="outline" className="flex-1 gap-2 sm:flex-none" onClick={() => onPlan(book)}>
            <CalendarClock className="w-4 h-4" /> Запланировать
          </Button>
          <Button variant="outline" className="flex-1 gap-2 sm:flex-none" onClick={() => onRecommend(book)}>
            <Share2 className="w-4 h-4" /> Порекомендовать
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2 text-muted-foreground hover:text-destructive sm:flex-none"
            onClick={() => onNotInterested(book)}
          >
            <Trash2 className="w-4 h-4" /> Не интересно
          </Button>
        </div>
      </div>
    </div>
  );
}
