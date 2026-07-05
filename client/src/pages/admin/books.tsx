import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  BookOpen,
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { modalAlert } from "@/hooks/use-toast";
import { deleteGuestBookAdmin, fetchBooks, fetchGuestBooks, updateGuestBookStatus } from "./books/api";
import { BooksTable, BooksTableSkeleton, GuestBookStatusBadge } from "./books/books-table";
import type { BooksFilters, BooksResponse, GuestBooksResponse } from "./books/types";

export default function AdminBooks() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<BooksFilters>({
    search: '',
    status: 'all',
    genre: 'all',
    page: 1,
    limit: 20,
  });
  const [guestStatusFilter, setGuestStatusFilter] = useState<string>("all");
  const [guestSearchInput, setGuestSearchInput] = useState("");
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [guestPage, setGuestPage] = useState(1);
  const [guestLimit] = useState(20);

  const { data, isLoading, error } = useQuery<BooksResponse>({
    queryKey: ['admin-books', filters],
    queryFn: () => fetchBooks(filters),
  });

  const {
    data: guestBooksData,
    isLoading: isGuestBooksLoading,
  } = useQuery<GuestBooksResponse>({
    queryKey: ["admin-guest-books", guestSearchQuery, guestStatusFilter, guestPage, guestLimit],
    queryFn: () => fetchGuestBooks({
      search: guestSearchQuery,
      status: guestStatusFilter,
      page: guestPage,
      limit: guestLimit,
    }),
  });

  const guestStatusMutation = useMutation({
    mutationFn: ({ bookId, status, notes }: { bookId: string; status: "approved" | "rejected"; notes?: string }) =>
      updateGuestBookStatus(bookId, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-guest-books"] });
    },
    onError: (mutationError: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const guestDeleteMutation = useMutation({
    mutationFn: (bookId: string) => deleteGuestBookAdmin(bookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-guest-books"] });
    },
    onError: (mutationError: Error) => {
      void modalAlert({
        title: "Ошибка удаления",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  };

  const handleGenreChange = (genre: string) => {
    setFilters(prev => ({ ...prev, genre, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить книги</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage}</p>
            <Button className="mt-4" onClick={() => globalThis.location.reload()}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Управление книгами</h1>
            <p className="text-gray-600 mt-2">
              {data && `Найдено ${data.pagination.total} книг`}
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего книг</p>
                  <p className="text-2xl font-bold">{data?.pagination.total || 0}</p>
                </div>
                <BookOpen className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Активные</p>
                  <p className="text-2xl font-bold text-green-600">
                    {data?.books.filter(b => b.status === 'active').length || 0}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">На модерации</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {data?.books.filter(b => b.status === 'pending').length || 0}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Заблокированные</p>
                  <p className="text-2xl font-bold text-red-600">
                    {data?.books.filter(b => b.status === 'blocked').length || 0}
                  </p>
                </div>
                <Ban className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск по названию, автору или ISBN..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={filters.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="pending">На модерации</SelectItem>
                  <SelectItem value="blocked">Заблокированные</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={filters.genre === 'all' ? '' : filters.genre}
                onChange={(e) => handleGenreChange(e.target.value || 'all')}
                placeholder="Фильтр по жанру"
                className="w-full md:w-48"
              />
            </div>
          </CardContent>
        </Card>

        {/* Books Table */}
        <Card>
          <CardContent className="p-0">
            {(() => {
              if (isLoading) {
                return <BooksTableSkeleton />;
              }
              
              if (data && data.books.length > 0) {
                return <BooksTable books={data.books} />;
              }
              
              return (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">Книги не найдены</h3>
                  <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Guest Books Moderation */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Гостевые книги</h3>
                <p className="text-sm text-gray-600">Отдельная модерация и удаление гостевого контента</p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative md:w-72">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск по названию, автору или коду..."
                    value={guestSearchInput}
                    onChange={(event) => setGuestSearchInput(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={guestStatusFilter}
                  onValueChange={(value) => {
                    setGuestStatusFilter(value);
                    setGuestPage(1);
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Статус гостевых книг" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    <SelectItem value="pending">Ожидают проверки</SelectItem>
                    <SelectItem value="approved">Разрешенные</SelectItem>
                    <SelectItem value="rejected">Заблокированные</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGuestSearchQuery(guestSearchInput.trim());
                    setGuestPage(1);
                  }}
                >
                  Найти
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGuestSearchInput("");
                    setGuestSearchQuery("");
                    setGuestStatusFilter("all");
                    setGuestPage(1);
                  }}
                >
                  Сбросить
                </Button>
              </div>
            </div>

            {isGuestBooksLoading ? (
              <div className="p-6 text-sm text-gray-500">Загрузка гостевых книг...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-4 font-medium text-gray-600">Книга</th>
                      <th className="text-left p-4 font-medium text-gray-600">Гость</th>
                      <th className="text-left p-4 font-medium text-gray-600">Статус</th>
                      <th className="text-left p-4 font-medium text-gray-600">Загрузка</th>
                      <th className="text-right p-4 font-medium text-gray-600">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(guestBooksData?.books || []).map((book) => (
                      <tr key={book.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="font-medium text-gray-900">{book.title}</div>
                          <div className="text-sm text-gray-500">{book.author}</div>
                        </td>
                        <td className="p-4">
                          <code className="text-xs bg-gray-100 rounded px-2 py-1">{book.guestAccessCode}</code>
                        </td>
                        <td className="p-4">
                          <GuestBookStatusBadge status={book.moderationStatus} />
                        </td>
                        <td className="p-4 text-sm text-gray-500">
                          {new Date(book.uploadedAt).toLocaleString("ru")}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                globalThis.open(`/api/v1/admin/guest-books/${book.id}/download`, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Скачать
                            </Button>

                            {book.moderationStatus !== "approved" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600"
                                onClick={() => {
                                  guestStatusMutation.mutate({ bookId: book.id, status: "approved" });
                                }}
                                disabled={guestStatusMutation.isPending}
                              >
                                Разрешить
                              </Button>
                            )}

                            {book.moderationStatus !== "rejected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                onClick={() => {
                                  const reason = globalThis.prompt("Укажите причину блокировки:", "Нарушение правил платформы");
                                  if (!reason?.trim()) {
                                    return;
                                  }
                                  guestStatusMutation.mutate({
                                    bookId: book.id,
                                    status: "rejected",
                                    notes: reason.trim(),
                                  });
                                }}
                                disabled={guestStatusMutation.isPending}
                              >
                                Заблокировать
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-700"
                              onClick={() => {
                                const confirmed = globalThis.confirm("Удалить гостевую книгу безвозвратно?");
                                if (!confirmed) {
                                  return;
                                }
                                guestDeleteMutation.mutate(book.id);
                              }}
                              disabled={guestDeleteMutation.isPending}
                            >
                              Удалить
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {(!guestBooksData?.books || guestBooksData.books.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sm text-gray-500">
                          Гостевые книги не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!!guestBooksData?.pagination && guestBooksData.pagination.total > 0 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Показано {(guestBooksData.pagination.page - 1) * guestBooksData.pagination.limit + 1}
                  –
                  {Math.min(
                    guestBooksData.pagination.page * guestBooksData.pagination.limit,
                    guestBooksData.pagination.total,
                  )}
                  {' '}из {guestBooksData.pagination.total} гостевых книг
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={guestBooksData.pagination.page <= 1}
                    onClick={() => setGuestPage((prev) => Math.max(prev - 1, 1))}
                  >
                    Предыдущая
                  </Button>
                  <span className="text-sm text-gray-600">
                    Страница {guestBooksData.pagination.page} из {Math.max(guestBooksData.pagination.pages, 1)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={guestBooksData.pagination.page >= Math.max(guestBooksData.pagination.pages, 1)}
                    onClick={() =>
                      setGuestPage((prev) => Math.min(prev + 1, Math.max(guestBooksData.pagination.pages, 1)))
                    }
                  >
                    Следующая
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.pagination.total > filters.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Показано {Math.min(filters.limit, data.pagination.total)} из {data.pagination.total} книг
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Предыдущая
              </Button>
              <span className="text-sm text-gray-600">
                Страница {filters.page} из {Math.ceil(data.pagination.total / filters.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= Math.ceil(data.pagination.total / filters.limit)}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Следующая
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
