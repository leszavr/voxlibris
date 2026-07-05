import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, BookOpen, Calendar, CheckCircle, Download, MoreHorizontal, Trash2, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { modalAlert } from "@/hooks/use-toast";

import { deleteBook, updateBookStatus } from "./api";
import type { Book, GuestBook } from "./types";

function buildBookDownloadUrl(book: Book): string {
  const params = new URLSearchParams({ source: book.source });
  return `/api/v1/admin/books/${book.id}/download?${params.toString()}`;
}

export function BookStatusBadge({ status }: Readonly<{ status: Book['status'] }>) {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Активна</Badge>;
    case 'pending':
      return <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200"><CheckCircle className="w-3 h-3 mr-1" />На модерации</Badge>;
    case 'blocked':
      return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200"><Ban className="w-3 h-3 mr-1" />Заблокирована</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function GuestBookStatusBadge({ status }: Readonly<{ status: GuestBook["moderationStatus"] }>) {
  if (status === "approved") {
    return <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Разрешена</Badge>;
  }

  if (status === "rejected") {
    return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200"><Ban className="w-3 h-3 mr-1" />Заблокирована</Badge>;
  }

  return <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200"><CheckCircle className="w-3 h-3 mr-1" />Ожидает проверки</Badge>;
}

function BookActionsMenu({ book }: Readonly<{ book: Book }>) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const deleteBookMutation = useMutation({
    mutationFn: ({ bookId, source }: { bookId: string; source: string }) => deleteBook(bookId, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      void modalAlert({ title: "Ошибка удаления", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ bookId, status, source, reason }: { bookId: string; status: string; source: string; reason?: string }) =>
      updateBookStatus(bookId, status, source, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
      if (variables.status === 'blocked') {
        setShowBlockDialog(false);
        setBlockReason("");
      }
    },
    onError: (error: Error) => {
      void modalAlert({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const handleConfirmBlock = () => {
    const normalizedReason = blockReason.trim();
    if (!normalizedReason) {
      void modalAlert({ title: "Причина обязательна", description: "Укажите причину блокировки книги", variant: "destructive" });
      return;
    }

    updateStatusMutation.mutate({ bookId: book.id, status: 'blocked', source: book.source, reason: normalizedReason });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><a href={buildBookDownloadUrl(book)} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4 mr-2" />Скачать для проверки</a></DropdownMenuItem>
          {book.status === 'pending' && (
            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ bookId: book.id, status: 'active', source: book.source })} disabled={updateStatusMutation.isPending} className="text-green-600">
              <CheckCircle className="w-4 h-4 mr-2" />Одобрить
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              if (book.status === 'blocked') {
                updateStatusMutation.mutate({ bookId: book.id, status: 'active', source: book.source });
                return;
              }
              setShowBlockDialog(true);
            }}
            disabled={updateStatusMutation.isPending}
            className={book.status === 'blocked' ? 'text-green-600' : 'text-red-600'}
          >
            {book.status === 'blocked' ? <><CheckCircle className="w-4 h-4 mr-2" />Разблокировать</> : <><Ban className="w-4 h-4 mr-2" />Заблокировать</>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} disabled={deleteBookMutation.isPending} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Удалить</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showBlockDialog} onOpenChange={(open) => { setShowBlockDialog(open); if (!open) setBlockReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заблокировать книгу?</DialogTitle>
            <DialogDescription>
              Укажите причину блокировки книги "{book.title}".
              {book.source === 'books' ? "" : " Пользователю будет отправлено email-уведомление."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`book-block-reason-${book.id}`}>Причина блокировки</Label>
            <Textarea id={`book-block-reason-${book.id}`} value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Например: нарушение авторских прав, запрещенный контент, нарушение законодательства РФ..." rows={5} disabled={updateStatusMutation.isPending} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowBlockDialog(false)} disabled={updateStatusMutation.isPending}>Отмена</Button>
            <Button type="button" onClick={handleConfirmBlock} className="bg-red-600 hover:bg-red-700" disabled={updateStatusMutation.isPending}>{updateStatusMutation.isPending ? 'Блокировка...' : 'Заблокировать'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить книгу?</AlertDialogTitle>
            <AlertDialogDescription>Вы собираетесь удалить книгу "{book.title}". Это действие необратимо — книга будет удалена окончательно из системы.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBookMutation.mutate({ bookId: book.id, source: book.source })} className="bg-red-600 hover:bg-red-700" disabled={deleteBookMutation.isPending}>{deleteBookMutation.isPending ? 'Удаление...' : 'Удалить'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function BooksTable({ books }: Readonly<{ books: Book[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr className="border-b bg-gray-50"><th className="text-left p-4 font-medium text-gray-600">Книга</th><th className="text-left p-4 font-medium text-gray-600">Автор</th><th className="text-left p-4 font-medium text-gray-600">Статус</th><th className="text-left p-4 font-medium text-gray-600">Загрузка</th><th className="text-left p-4 font-medium text-gray-600">Популярность</th><th className="text-right p-4 font-medium text-gray-600">Действия</th></tr></thead>
        <tbody>
          {books.map((book) => (
            <tr key={book.id} className="border-b hover:bg-gray-50">
              <td className="p-4"><div className="flex items-center gap-3">{book.cover_url ? <img src={book.cover_url} alt={book.title} className="w-12 h-16 object-cover rounded" /> : <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center"><BookOpen className="h-6 w-6 text-gray-400" /></div>}<div><div className="font-medium text-gray-900">{book.title}</div>{book.genre && <div className="text-sm text-gray-500">{book.genre}</div>}{book.isbn && <div className="text-xs text-gray-400">ISBN: {book.isbn}</div>}</div></div></td>
              <td className="p-4"><div className="font-medium text-gray-900">{book.author}</div></td>
              <td className="p-4"><BookStatusBadge status={book.status} /></td>
              <td className="p-4"><div className="text-sm"><div className="flex items-center gap-1 text-gray-500"><User className="w-3 h-3" />{book.uploaded_by}</div><div className="flex items-center gap-1 text-gray-500"><Calendar className="w-3 h-3" />{new Date(book.upload_date).toLocaleDateString('ru')}</div><div className="text-gray-400">{formatFileSize(book.file_size)}</div></div></td>
              <td className="p-4"><div className="text-sm"><div>{book.downloads_count} загрузок</div><div className="text-gray-500">{book.clubs_count} клубов</div></div></td>
              <td className="p-4 text-right"><BookActionsMenu book={book} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BooksTableSkeleton() {
  const skeletonKeys = ['book-sk-1', 'book-sk-2', 'book-sk-3', 'book-sk-4', 'book-sk-5'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr className="border-b bg-gray-50"><th className="text-left p-4 font-medium text-gray-600">Книга</th><th className="text-left p-4 font-medium text-gray-600">Автор</th><th className="text-left p-4 font-medium text-gray-600">Статус</th><th className="text-left p-4 font-medium text-gray-600">Загрузка</th><th className="text-left p-4 font-medium text-gray-600">Популярность</th><th className="text-right p-4 font-medium text-gray-600">Действия</th></tr></thead>
        <tbody>
          {skeletonKeys.map((key) => (
            <tr key={key} className="border-b">
              <td className="p-4"><div className="flex items-center gap-3"><Skeleton className="w-12 h-16 rounded" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-20" /></div></div></td>
              <td className="p-4"><Skeleton className="h-4 w-24" /></td>
              <td className="p-4"><Skeleton className="h-6 w-20" /></td>
              <td className="p-4"><div className="space-y-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div></td>
              <td className="p-4"><div className="space-y-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-16" /></div></td>
              <td className="p-4 text-right"><Skeleton className="h-8 w-8" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
