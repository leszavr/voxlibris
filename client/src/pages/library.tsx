import { BookOpen, Layers, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AccountActivationBanner } from "@/components/AccountActivationBanner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeletePersonalBook,
  useGenresCatalog,
  usePersonalBooks,
  useUpdatePersonalBook,
  type PersonalBook,
} from "@/hooks/use-books-v2";
import { useClearReadingHistory, useReadingHistory } from "@/hooks/use-reading-history";
import { useAllBookmarks, useDeleteBookmarkEntry } from "@/hooks/use-reader";
import { savePendingReaderBookmarkNavigation } from "@/lib/reader-bookmark-navigation";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { socialApi, type FollowUser } from "@/api/social";
import { LibraryDialogs } from "./library/dialogs";
import { PersonalLibraryBookCard } from "./library/personal-book-card";
import { BookmarksTab, HistoryTab } from "./library/reading-tabs";
import { EmptyLibraryState, LibraryAuthRequired, LibraryLoadingSkeleton } from "./library/states";
import type { DmConversationCreateResponse, GenreGroupMode, LibrarySort, ReadingStatusRecord, ShelfFormatFilter, ShelfSort } from "./library/types";
import {
  encodeRecommendationPayload,
  generateDeleteCode,
  isShelvedCompletedStatus,
  loadAllFollowUsers,
  SHELF_PAGE_SIZE,
  useLocalStorageState,
} from "./library/utils";

export default function Library() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const futureYears = Array.from({ length: 15 }, (_, index) => currentYear + index + 1);
  const { data: userBooksResponse, isLoading, refetch } = usePersonalBooks();
  const { data: genreCatalog = [] } = useGenresCatalog();
  const books = userBooksResponse || [];
  const { data: completedStatuses = [] } = useQuery<ReadingStatusRecord[]>({
    queryKey: ["reading-status", "completed", "personal"],
    queryFn: async () => apiRequest<ReadingStatusRecord[]>("/api/reading-status?status=completed&bookType=personal"),
    enabled: isAuthenticated,
  });
  const shelvedCompletedStatuses = useMemo(
    () => completedStatuses.filter(isShelvedCompletedStatus),
    [completedStatuses],
  );
  const shelvedCompletedBookIds = useMemo(
    () => new Set(shelvedCompletedStatuses.map((item) => item.bookId)),
    [shelvedCompletedStatuses],
  );
  const visibleBooks = books.filter((book) => !shelvedCompletedBookIds.has(book.id));
  const { bookmarks, isLoading: bookmarksLoading } = useAllBookmarks();

  // Reading history data
  const { data: historyData } = useReadingHistory();
  const clearHistory = useClearReadingHistory();

  // State for book management dialogs
  const [editingBook, setEditingBook] = useState<PersonalBook | null>(null);
  const [deletingBook, setDeletingBook] = useState<PersonalBook | null>(null);
  const [planningBook, setPlanningBook] = useState<PersonalBook | null>(null);
  const [notInterestedBook, setNotInterestedBook] = useState<PersonalBook | null>(null);
  const [shelfDeleteItem, setShelfDeleteItem] = useState<ReadingStatusRecord | null>(null);
  const [shelfDeleteCode, setShelfDeleteCode] = useState<string>("");
  const [shelfDeleteInput, setShelfDeleteInput] = useState<string>("");
  const [shelfDeletionUnlocked, setShelfDeletionUnlocked] = useState(false);
  const [shelfSearch, setShelfSearch] = useState("");

  const [shelfSort, setShelfSort] = useLocalStorageState<ShelfSort>("vl.shelfSort", "completed_desc");
  const [shelfFormatFilter, setShelfFormatFilter] = useLocalStorageState<ShelfFormatFilter>("vl.shelfFormatFilter", "all");
  const [shelfVisibleCount, setShelfVisibleCount] = useState<number>(SHELF_PAGE_SIZE);
  const [plannedYear, setPlannedYear] = useState<number>(currentYear + 1);
  const [librarySearch, setLibrarySearch] = useState<string>("");
  const [librarySort, setLibrarySort] = useLocalStorageState<LibrarySort>("vl.librarySort", "created_desc");
  const [libraryGenreFilter, setLibraryGenreFilter] = useLocalStorageState<string>("vl.libraryGenreFilter", "all");
  const [libraryGroupMode, setLibraryGroupMode] = useLocalStorageState<GenreGroupMode>("vl.libraryGroupMode", "none");
  const [recommendBook, setRecommendBook] = useState<PersonalBook | null>(null);
  const [recommendTargets, setRecommendTargets] = useState<FollowUser[]>([]);
  const [recommendSelectedUserIds, setRecommendSelectedUserIds] = useState<Set<string>>(new Set());
  const [recommendComment, setRecommendComment] = useState("");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendSending, setRecommendSending] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    description: "",
    genre: "",
  });
  const fallbackCover = "/placeholder-book.png";

  const allTargetsSelected = recommendTargets.length > 0 && recommendSelectedUserIds.size === recommendTargets.length;

  const renderRecommendTargetsList = () => {
    if (recommendLoading) {
      return (
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка списка пользователей...
        </div>
      );
    }

    if (recommendTargets.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground text-center">
          Нет доступных пользователей для рекомендации.
        </div>
      );
    }

    return (
      <div className="divide-y">
        {recommendTargets.map((target) => {
          const checked = recommendSelectedUserIds.has(target.id);
          const displayName = target.displayName || target.username;
          return (
            <label key={target.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => toggleRecommendTarget(target.id, value === true)}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">@{target.username}</p>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  // Mutations for book management
  const deleteBookMutation = useDeletePersonalBook();
  const updateBookMutation = useUpdatePersonalBook();
  const deleteBookmarkMutation = useDeleteBookmarkEntry();

  const planBookMutation = useMutation({
    mutationFn: async ({ bookId, year }: { bookId: string; year: number }) => {
      await apiRequest('/api/reading-status', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bookType: 'personal',
          status: 'planned',
          progress: 0,
          notes: JSON.stringify({ plannedYear: year }),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга запланирована',
        description: `Добавили в планы на ${plannedYear} год`,
      });
      setPlanningBook(null);
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось запланировать книгу',
        variant: 'destructive',
      });
    },
  });

  const markAsNotInterestedMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/v1/user/books/${bookId}?markAsAbandoned=true`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/user/books'] });
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга перенесена в «Брошено»',
        description: 'Книга удалена из библиотеки и сохранена в статистике',
      });
      setNotInterestedBook(null);
      refetch();
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить книгу из библиотеки',
        variant: 'destructive',
      });
    },
  });

  const markAsCompletedMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest('/api/reading-status', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bookType: 'personal',
          status: 'completed',
          progress: 100,
          notes: JSON.stringify({ shelved: true }),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/books"] });
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга перенесена на полку',
        description: 'Книга отмечена как прочитанная и скрыта из библиотеки',
      });
      refetch();
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось отметить книгу как прочитанную',
        variant: 'destructive',
      });
    },
  });

  const removeFromShelfMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/reading-status/${bookId}?bookType=personal`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга удалена с полки',
        description: 'Запись о прочитанной книге удалена',
      });
      setShelfDeleteItem(null);
      setShelfDeleteCode("");
      setShelfDeleteInput("");
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить книгу с полки',
        variant: 'destructive',
      });
    },
  });

  const handleBookUploadSuccess = () => {
    refetch();
  };

  const handleEditBook = (book: PersonalBook) => {
    setEditingBook(book);
    setEditForm({
      title: book.title || "",
      author: book.author || "",
      description: book.description || "",
      genre: book.genre || "",
    });
  };

  const handleUpdateBook = async () => {
    if (!editingBook) return;

    try {
      await updateBookMutation.mutateAsync({
        bookId: editingBook.id,
        updates: {
          ...editForm,
          genres: editForm.genre.trim() ? [editForm.genre.trim()] : [],
        },
      });

      toast({
        title: "Успешно",
        description: "Книга обновлена",
      });

      setEditingBook(null);
      refetch();
    } catch (error) {
      console.error("Error updating book:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить книгу",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async () => {
    if (!deletingBook) return;

    try {
      await deleteBookMutation.mutateAsync(deletingBook.id);

      toast({
        title: "Успешно",
        description: "Книга удалена",
      });

      setDeletingBook(null);
      refetch();
    } catch (error) {
      console.error("Error deleting book:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить книгу",
        variant: "destructive",
      });
    }
  };

  const handleReadBook = (book: PersonalBook) => {
    setLocation(`/books/${book.id}/read`);
  };

  const handlePlanBook = (book: PersonalBook) => {
    setPlanningBook(book);
    setPlannedYear(currentYear + 1);
  };

  const handleConfirmPlanBook = () => {
    if (!planningBook) return;

    if (plannedYear <= currentYear) {
      toast({
        title: 'Некорректный год',
        description: 'Можно выбрать только будущий год',
        variant: 'destructive',
      });
      return;
    }

    planBookMutation.mutate({
      bookId: planningBook.id,
      year: plannedYear,
    });
  };

  const handleMarkAsCompleted = (book: PersonalBook) => {
    markAsCompletedMutation.mutate(book.id);
  };

  const handleConfirmNotInterested = () => {
    if (!notInterestedBook) return;
    markAsNotInterestedMutation.mutate(notInterestedBook.id);
  };

  const loadRecommendationTargets = async () => {
    if (!user?.id) return;

    setRecommendLoading(true);
    try {
      const [followers, following] = await Promise.all([
        loadAllFollowUsers(socialApi.getFollowers, user.id),
        loadAllFollowUsers(socialApi.getFollowing, user.id),
      ]);

      const uniqueMap = new Map<string, FollowUser>();
      [...followers, ...following].forEach((item) => {
        uniqueMap.set(item.id, item);
      });

      const uniqueTargets = Array.from(uniqueMap.values()).sort((a, b) => {
        const left = a.displayName || a.username;
        const right = b.displayName || b.username;
        return left.localeCompare(right, "ru");
      });

      setRecommendTargets(uniqueTargets);
      setRecommendSelectedUserIds(new Set(uniqueTargets.map((u) => u.id)));
    } catch {
      toast({
        title: "Не удалось загрузить список пользователей",
        description: "Проверьте соединение и попробуйте снова",
        variant: "destructive",
      });
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleOpenRecommendDialog = (book: PersonalBook) => {
    setRecommendBook(book);
    setRecommendComment("");
    setRecommendTargets([]);
    setRecommendSelectedUserIds(new Set());
    void loadRecommendationTargets();
  };

  const toggleRecommendTarget = (targetId: string, checked: boolean) => {
    setRecommendSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(targetId);
      } else {
        next.delete(targetId);
      }
      return next;
    });
  };

  const handleToggleSelectAllTargets = (checked: boolean) => {
    if (checked) {
      setRecommendSelectedUserIds(new Set(recommendTargets.map((u) => u.id)));
      return;
    }
    setRecommendSelectedUserIds(new Set());
  };

  const handleSendBookRecommendation = async () => {
    if (!recommendBook) return;
    if (recommendSelectedUserIds.size === 0) {
      toast({ title: "Выберите хотя бы одного получателя", variant: "destructive" });
      return;
    }

    const payload = encodeRecommendationPayload({
      type: "book",
      entityId: recommendBook.id,
      title: recommendBook.title,
      subtitle: `Автор: ${recommendBook.author}`,
      imageUrl: recommendBook.coverUrl ?? null,
      comment: recommendComment.trim() || null,
    });

    setRecommendSending(true);
    try {
      const recipientIds = Array.from(recommendSelectedUserIds);

      await Promise.all(recipientIds.map(async (recipientId) => {
        const conv = await apiRequest<DmConversationCreateResponse>("/api/dm/conversations", {
          method: "POST",
          body: JSON.stringify({ recipientId }),
        });

        await apiRequest(`/api/dm/conversations/${conv.conversation.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body: payload }),
        });
      }));

      toast({ title: "Рекомендация отправлена" });
      setRecommendBook(null);
    } catch {
      toast({ title: "Не удалось отправить рекомендацию", variant: "destructive" });
    } finally {
      setRecommendSending(false);
    }
  };

  const handleOpenBookmark = (bookmark: {
    bookId: string;
    position: string;
  }) => {
    savePendingReaderBookmarkNavigation({
      bookId: bookmark.bookId,
      position: bookmark.position,
    });
    setLocation(`/books/${bookmark.bookId}/read`);
  };

  const handleDeleteBookmark = async (bookmark: {
    id: string;
    bookId: string;
  }) => {
    try {
      await deleteBookmarkMutation.mutateAsync({
        bookId: bookmark.bookId,
        bookmarkId: bookmark.id,
      });
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить закладку",
        variant: "destructive",
      });
    }
  };

  const shelfItems = useMemo(() => {
    const search = shelfSearch.trim().toLowerCase();

    return shelvedCompletedStatuses
      .filter((item) => {
        if (!item.book) return false;

        if (shelfFormatFilter !== "all" && item.book.format !== shelfFormatFilter) {
          return false;
        }

        if (!search) return true;

        const title = item.book.title.toLowerCase();
        const author = item.book.author.toLowerCase();
        return title.includes(search) || author.includes(search);
      })
      .sort((a, b) => {
        const dateA = new Date(a.completedAt ?? a.updatedAt ?? 0).getTime();
        const dateB = new Date(b.completedAt ?? b.updatedAt ?? 0).getTime();

        if (shelfSort === "completed_desc") return dateB - dateA;
        if (shelfSort === "completed_asc") return dateA - dateB;

        const titleA = a.book?.title ?? "";
        const titleB = b.book?.title ?? "";
        if (shelfSort === "title_desc") return titleB.localeCompare(titleA, "ru");
        return titleA.localeCompare(titleB, "ru");
      });
  }, [shelvedCompletedStatuses, shelfFormatFilter, shelfSearch, shelfSort]);

  useEffect(() => {
    setShelfVisibleCount(SHELF_PAGE_SIZE);
  }, [shelfSearch, shelfSort, shelfFormatFilter]);

  const visibleShelfItems = shelfItems.slice(0, shelfVisibleCount);
  const canLoadMoreShelfItems = shelfVisibleCount < shelfItems.length;

  const handleLoadMoreShelfItems = () => {
    setShelfVisibleCount((prev) => prev + SHELF_PAGE_SIZE);
  };

  const handleAskShelfDelete = (item: ReadingStatusRecord) => {
    setShelfDeleteItem(item);
    setShelfDeleteCode(generateDeleteCode());
    setShelfDeleteInput("");
  };

  const handleCloseShelfDelete = () => {
    setShelfDeleteItem(null);
    setShelfDeleteCode("");
    setShelfDeleteInput("");
  };

  const handleConfirmShelfDelete = () => {
    if (!shelfDeleteItem) return;

    if (shelfDeleteInput !== shelfDeleteCode) {
      toast({
        title: "Неверный код",
        description: "Введите код подтверждения точно как в окне",
        variant: "destructive",
      });
      return;
    }

    removeFromShelfMutation.mutate(shelfDeleteItem.bookId);
  };

  useEffect(() => {
    if (!shelfDeletionUnlocked && shelfDeleteItem) {
      handleCloseShelfDelete();
    }
  }, [shelfDeletionUnlocked, shelfDeleteItem]);

  const filteredAndSortedBooks = useMemo(() => {
    const search = librarySearch.trim().toLowerCase();

    const matchesSearch = (book: PersonalBook) => {
      if (!search) return true;
      const title = (book.title || "").toLowerCase();
      const author = (book.author || "").toLowerCase();
      const genreText = (book.genre || "").toLowerCase();
      const genreLabels = (book.genres || []).map((g) => g.label.toLowerCase()).join(" ");
      return title.includes(search) || author.includes(search) || genreText.includes(search) || genreLabels.includes(search);
    };

    const matchesGenre = (book: PersonalBook) => {
      if (libraryGenreFilter === "all") return true;
      if (libraryGenreFilter === "none") return !book.primaryGenre;
      return book.primaryGenre?.code === libraryGenreFilter || (book.genres || []).some((genre) => genre.code === libraryGenreFilter);
    };

    const sorted = visibleBooks
      .filter(matchesSearch)
      .filter(matchesGenre)
      .sort((left, right) => {
        if (librarySort === "created_desc") {
          return new Date(right.createdAt ?? right.uploadedAt).getTime() - new Date(left.createdAt ?? left.uploadedAt).getTime();
        }
        if (librarySort === "created_asc") {
          return new Date(left.createdAt ?? left.uploadedAt).getTime() - new Date(right.createdAt ?? right.uploadedAt).getTime();
        }
        if (librarySort === "title_asc") return left.title.localeCompare(right.title, "ru");
        if (librarySort === "title_desc") return right.title.localeCompare(left.title, "ru");
        if (librarySort === "author_asc") return left.author.localeCompare(right.author, "ru");
        if (librarySort === "author_desc") return right.author.localeCompare(left.author, "ru");

        const leftGenre = left.primaryGenre?.label || left.genre || "";
        const rightGenre = right.primaryGenre?.label || right.genre || "";
        return leftGenre.localeCompare(rightGenre, "ru");
      });

    return sorted;
  }, [visibleBooks, libraryGenreFilter, librarySearch, librarySort]);

  const groupedBooks = useMemo(() => {
    if (libraryGroupMode !== "primary_genre") {
      return [{ key: "all", label: "Все книги", books: filteredAndSortedBooks }];
    }

    const map = new Map<string, PersonalBook[]>();
    for (const book of filteredAndSortedBooks) {
      const key = book.primaryGenre?.code ?? "none";
      const list = map.get(key) || [];
      list.push(book);
      map.set(key, list);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ru"))
      .map(([key, grouped]) => ({
        key,
        label: key === "none" ? "Без жанра" : (grouped[0]?.primaryGenre?.label || grouped[0]?.genre || "Без жанра"),
        books: grouped,
      }));
  }, [filteredAndSortedBooks, libraryGroupMode]);

  const formatBookGenres = (book: PersonalBook) => {
    const labels = (book.genres || []).map((genre) => genre.label).filter(Boolean);
    if (labels.length > 0) {
      return labels.join(", ");
    }

    return book.primaryGenre?.label || book.genre || "";
  };

  const renderCurrentTabContent = () => {
    if (isLoading) {
      return <LibraryLoadingSkeleton />;
    }

    return (
      <>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Поиск: название, автор, жанр"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
              />

              <Select value={libraryGenreFilter} onValueChange={setLibraryGenreFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Жанр" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все жанры</SelectItem>
                  <SelectItem value="none">Без жанра</SelectItem>
                  {genreCatalog.map((genre) => (
                    <SelectItem key={genre.id} value={genre.code}>{genre.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={librarySort} onValueChange={(value) => setLibrarySort(value as LibrarySort)}>
                <SelectTrigger>
                  <SelectValue placeholder="Сортировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_desc">Сначала новые</SelectItem>
                  <SelectItem value="created_asc">Сначала старые</SelectItem>
                  <SelectItem value="title_asc">Название: А-Я</SelectItem>
                  <SelectItem value="title_desc">Название: Я-А</SelectItem>
                  <SelectItem value="author_asc">Автор: А-Я</SelectItem>
                  <SelectItem value="author_desc">Автор: Я-А</SelectItem>
                  <SelectItem value="genre_asc">По жанру</SelectItem>
                </SelectContent>
              </Select>

              <Select value={libraryGroupMode} onValueChange={(value) => setLibraryGroupMode(value as GenreGroupMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Группировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без группировки</SelectItem>
                  <SelectItem value="primary_genre">По основному жанру</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filteredAndSortedBooks.length > 0 ? (
          groupedBooks.map((group) => (
            <div key={group.key} className="space-y-3">
              {libraryGroupMode === "primary_genre" && (
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">{group.label}</h3>
                </div>
              )}
              {group.books.map((book) => (
                <PersonalLibraryBookCard
                  key={book.id}
                  book={book}
                  fallbackCover={fallbackCover}
                  formatBookGenres={formatBookGenres}
                  onRead={handleReadBook}
                  onEdit={handleEditBook}
                  onDelete={setDeletingBook}
                  onMarkAsCompleted={handleMarkAsCompleted}
                  onPlan={handlePlanBook}
                  onRecommend={handleOpenRecommendDialog}
                  onNotInterested={setNotInterestedBook}
                  canMarkAsCompleted={(book.progress ?? 0) > 95 && !shelvedCompletedBookIds.has(book.id)}
                  markAsCompletedPending={markAsCompletedMutation.isPending}
                />
              ))}
            </div>
          ))
        ) : <EmptyLibraryState />}
      </>
    );
  };

  if (!isAuthenticated) {
    return <LibraryAuthRequired setLocation={setLocation} />;
  }

  return (
    <MainLayout>
      <div className="container space-y-6 px-4 py-8 sm:px-6 sm:py-10 md:px-12 md:py-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-primary">Моя Библиотека</h1>
            <p className="text-muted-foreground mt-1">
              Ваши книги, прогресс и сохраненные моменты.
            </p>
          </div>
          <VoxLibrisUpload
            defaultContext="personal"
            onSuccess={handleBookUploadSuccess}
            buttonText="Загрузить книгу"
          />
        </div>

        {/* Баннер активации аккаунта */}
        <AccountActivationBanner />

        <Tabs defaultValue="current" className="space-y-6 sm:space-y-8">
          <TabsList className="grid h-auto w-full grid-cols-4 rounded-xl bg-muted/80 p-1 sm:inline-flex sm:h-9 sm:w-auto">
            <TabsTrigger value="current" className="min-h-10 px-2 text-xs sm:text-sm">Читаю сейчас</TabsTrigger>
            <TabsTrigger value="shelf" className="min-h-10 px-2 text-xs sm:text-sm">Книжная полка</TabsTrigger>
            <TabsTrigger value="history" className="min-h-10 px-2 text-xs sm:text-sm">История</TabsTrigger>
            <TabsTrigger value="bookmarks" className="min-h-10 px-2 text-xs sm:text-sm">Закладки</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">
            {renderCurrentTabContent()}
          </TabsContent>

          <TabsContent value="shelf" className="space-y-4">
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Книжная полка</h3>
                    <p className="text-sm text-muted-foreground">
                      Прочитанные книги, которые вы вручную отметили кнопкой «Прочитано».
                    </p>
                  </div>
                  <Button
                    variant={shelfDeletionUnlocked ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShelfDeletionUnlocked((prev) => !prev)}
                  >
                    {shelfDeletionUnlocked ? "Режим удаления включен" : "Разблокировать удаление"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Поиск по названию и автору"
                    value={shelfSearch}
                    onChange={(e) => setShelfSearch(e.target.value)}
                  />

                  <Select value={shelfFormatFilter} onValueChange={(value) => setShelfFormatFilter(value as ShelfFormatFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Формат" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все форматы</SelectItem>
                      <SelectItem value="EPUB">EPUB</SelectItem>
                      <SelectItem value="FB2">FB2</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={shelfSort} onValueChange={(value) => setShelfSort(value as ShelfSort)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Сортировка" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed_desc">Сначала недавно прочитанные</SelectItem>
                      <SelectItem value="completed_asc">Сначала давно прочитанные</SelectItem>
                      <SelectItem value="title_asc">Название: А-Я</SelectItem>
                      <SelectItem value="title_desc">Название: Я-А</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {shelfItems.length === 0 ? (
              <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium">Полка пуста</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                  Отмечайте книги кнопкой «Прочитано», чтобы переносить их на полку.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleShelfItems.map((item) => {
                    if (!item.book) return null;

                    const completedAt = item.completedAt ?? item.updatedAt;

                    return (
                      <Card key={item.id} className="overflow-hidden">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex gap-3">
                            <div className="w-16 h-24 rounded overflow-hidden bg-muted shrink-0">
                              {item.book.coverUrl ? (
                                <img
                                  src={item.book.coverUrl}
                                  alt={item.book.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = fallbackCover;
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <BookOpen className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium line-clamp-2">{item.book.title}</h4>
                              <p className="text-sm text-muted-foreground truncate">{item.book.author}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Прочитано: {completedAt ? new Date(completedAt).toLocaleDateString("ru-RU") : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              className="flex-1"
                              onClick={() => setLocation(`/books/${item.bookId}/read`)}
                            >
                              Читать снова
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={!shelfDeletionUnlocked}
                              onClick={() => handleAskShelfDelete(item)}
                            >
                              Удалить
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {canLoadMoreShelfItems && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={handleLoadMoreShelfItems}>
                      Показать еще
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <HistoryTab historyData={historyData} clearHistory={clearHistory} />

          <BookmarksTab
            bookmarksLoading={bookmarksLoading}
            bookmarks={bookmarks}
            fallbackCover={fallbackCover}
            onOpenBookmark={handleOpenBookmark}
            onDeleteBookmark={(bookmark) => void handleDeleteBookmark(bookmark)}
            deleteBookmarkPending={deleteBookmarkMutation.isPending}
          />
        </Tabs>
      </div>

      <LibraryDialogs
        editingBook={editingBook}
        setEditingBook={setEditingBook}
        editForm={editForm}
        setEditForm={setEditForm}
        handleUpdateBook={handleUpdateBook}
        updateBookPending={updateBookMutation.isPending}
        deletingBook={deletingBook}
        setDeletingBook={setDeletingBook}
        handleDeleteBook={handleDeleteBook}
        deleteBookPending={deleteBookMutation.isPending}
        planningBook={planningBook}
        setPlanningBook={setPlanningBook}
        plannedYear={plannedYear}
        setPlannedYear={setPlannedYear}
        futureYears={futureYears}
        handleConfirmPlanBook={handleConfirmPlanBook}
        planBookPending={planBookMutation.isPending}
        recommendBook={recommendBook}
        setRecommendBook={setRecommendBook}
        recommendComment={recommendComment}
        setRecommendComment={setRecommendComment}
        allTargetsSelected={allTargetsSelected}
        handleToggleSelectAllTargets={handleToggleSelectAllTargets}
        recommendSelectedUserIds={recommendSelectedUserIds}
        renderRecommendTargetsList={renderRecommendTargetsList}
        handleSendBookRecommendation={() => void handleSendBookRecommendation()}
        recommendSending={recommendSending}
        recommendLoading={recommendLoading}
        shelfDeleteItem={shelfDeleteItem}
        shelfDeleteCode={shelfDeleteCode}
        shelfDeleteInput={shelfDeleteInput}
        setShelfDeleteInput={setShelfDeleteInput}
        handleCloseShelfDelete={handleCloseShelfDelete}
        handleConfirmShelfDelete={handleConfirmShelfDelete}
        removeFromShelfPending={removeFromShelfMutation.isPending}
        notInterestedBook={notInterestedBook}
        setNotInterestedBook={setNotInterestedBook}
        handleConfirmNotInterested={handleConfirmNotInterested}
        markAsNotInterestedPending={markAsNotInterestedMutation.isPending}
      />
    </MainLayout>
  );
}
