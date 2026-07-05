import { useState } from "react";
import { BookOpen, Calendar, Clock, Layers, Loader2, MessageCircle, Share2, Star, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { ClubDiscussionBoard } from "@/components/club/ClubDiscussionBoard";
import { ReadingPlan } from "@/components/club/reading-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useClubBooks, useDeleteClubBook, useSetActiveBook, type ClubBook } from "@/hooks/use-books-v2";
import { modalConfirm, useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FollowUser } from "@/api/social";
import type { ClubSettings, DmConversationCreateResponse, ScheduleItem } from "./shared";
import { encodeBookRecommendationPayload, loadAllFollowUsers } from "./shared";
import { socialApi } from "@/api/social";

interface ClubLibraryTabProps {
  readonly clubId: string;
  readonly activeBookId: string | null | undefined;
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly setLocation: (path: string) => void;
}

function ClubLibraryTab({ clubId, activeBookId, isOwner, isMember, setLocation }: ClubLibraryTabProps) {
  const { user } = useAuth();
  const { data: books = [], isLoading } = useClubBooks(clubId);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [sort, setSort] = useState<"title_asc" | "title_desc" | "author_asc" | "created_desc" | "genre_asc">("created_desc");
  const [groupByGenre, setGroupByGenre] = useState<"none" | "primary_genre">("none");
  const setActiveBook = useSetActiveBook(clubId);
  const deleteBookMutation = useDeleteClubBook(clubId);
  const [recommendBook, setRecommendBook] = useState<ClubBook | null>(null);
  const [recommendTargets, setRecommendTargets] = useState<FollowUser[]>([]);
  const [recommendSelectedUserIds, setRecommendSelectedUserIds] = useState<Set<string>>(new Set());
  const [recommendComment, setRecommendComment] = useState("");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendSending, setRecommendSending] = useState(false);
  const { toast } = useToast();

  const allTargetsSelected = recommendTargets.length > 0 && recommendSelectedUserIds.size === recommendTargets.length;

  const genreOptions = Array.from(
    new Map(
      books
        .filter((book) => book.primaryGenre)
        .map((book) => [book.primaryGenre!.code, book.primaryGenre!.label]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "ru"));

  const formatBookGenres = (book: ClubBook) => {
    const labels = (book.genres || []).map((genre) => genre.label).filter(Boolean);
    if (labels.length > 0) {
      return labels.join(", ");
    }

    return book.primaryGenre?.label || book.genre || "";
  };

  const filteredBooks = books
    .filter((book) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const title = book.title.toLowerCase();
      const author = book.author.toLowerCase();
      const genre = formatBookGenres(book).toLowerCase();
      return title.includes(q) || author.includes(q) || genre.includes(q);
    })
    .filter((book) => {
      if (genreFilter === "all") return true;
      if (genreFilter === "none") return !book.primaryGenre;
      return book.primaryGenre?.code === genreFilter || (book.genres || []).some((genre) => genre.code === genreFilter);
    })
    .sort((left, right) => {
      if (sort === "created_desc") {
        return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
      }
      if (sort === "title_asc") return left.title.localeCompare(right.title, "ru");
      if (sort === "title_desc") return right.title.localeCompare(left.title, "ru");
      if (sort === "author_asc") return left.author.localeCompare(right.author, "ru");
      const leftGenre = formatBookGenres(left);
      const rightGenre = formatBookGenres(right);
      return leftGenre.localeCompare(rightGenre, "ru");
    });

  const groupedBooks = groupByGenre === "primary_genre"
    ? Array.from(
        filteredBooks.reduce((acc, book) => {
          const key = book.primaryGenre?.code || "none";
          const label = book.primaryGenre?.label || "Без жанра";
          const existing = acc.get(key) || { label, items: [] as ClubBook[] };
          existing.items.push(book);
          acc.set(key, existing);
          return acc;
        }, new Map<string, { label: string; items: ClubBook[] }>()),
      ).map(([key, value]) => ({ key, label: value.label, books: value.items }))
    : [{ key: "all", label: "Все книги", books: filteredBooks }];

  const handleSetActive = async (bookId: string) => {
    setActiveBook.mutate(bookId, {
      onSuccess: () => toast({ title: "Активная книга изменена" }),
      onError: () => toast({ title: "Ошибка", description: "Не удалось изменить активную книгу", variant: "destructive" }),
    });
  };

  const handleDelete = async (book: ClubBook) => {
    const confirmed = await modalConfirm(`Удалить книгу «${book.title}»?`);
    if (!confirmed) return;
    deleteBookMutation.mutate(book.id, {
      onError: () => toast({ title: "Ошибка", description: "Не удалось удалить книгу", variant: "destructive" }),
    });
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
      toast({ title: "Не удалось загрузить получателей", variant: "destructive" });
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleOpenRecommendDialog = (book: ClubBook) => {
    setRecommendBook(book);
    setRecommendComment("");
    setRecommendTargets([]);
    setRecommendSelectedUserIds(new Set());
    void loadRecommendationTargets();
  };

  const handleToggleSelectAllTargets = (checked: boolean) => {
    if (checked) {
      setRecommendSelectedUserIds(new Set(recommendTargets.map((u) => u.id)));
      return;
    }
    setRecommendSelectedUserIds(new Set());
  };

  const toggleRecommendTarget = (targetId: string, checked: boolean) => {
    setRecommendSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(targetId);
      else next.delete(targetId);
      return next;
    });
  };

  const handleSendBookRecommendation = async () => {
    if (!recommendBook) return;
    if (recommendSelectedUserIds.size === 0) {
      toast({ title: "Выберите хотя бы одного получателя", variant: "destructive" });
      return;
    }

    const payload = encodeBookRecommendationPayload({
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
        const conv = await authFetch("/api/dm/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId }),
        });
        if (!conv.ok) throw new Error("failed to create conversation");
        const convData = await conv.json() as DmConversationCreateResponse;

        const sent = await authFetch(`/api/dm/conversations/${convData.conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload }),
        });
        if (!sent.ok) throw new Error("failed to send message");
      }));

      toast({ title: "Рекомендация отправлена" });
      setRecommendBook(null);
    } catch {
      toast({ title: "Не удалось отправить рекомендацию", variant: "destructive" });
    } finally {
      setRecommendSending(false);
    }
  };

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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>В библиотеке клуба пока нет книг</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Поиск: название, автор, жанр"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger><SelectValue placeholder="Жанр" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все жанры</SelectItem>
                <SelectItem value="none">Без жанра</SelectItem>
                {genreOptions.map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger><SelectValue placeholder="Сортировка" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Сначала новые</SelectItem>
                <SelectItem value="title_asc">Название: А-Я</SelectItem>
                <SelectItem value="title_desc">Название: Я-А</SelectItem>
                <SelectItem value="author_asc">Автор: А-Я</SelectItem>
                <SelectItem value="genre_asc">По жанру</SelectItem>
              </SelectContent>
            </Select>

            <Select value={groupByGenre} onValueChange={(value) => setGroupByGenre(value as typeof groupByGenre)}>
              <SelectTrigger><SelectValue placeholder="Группировка" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без группировки</SelectItem>
                <SelectItem value="primary_genre">По основному жанру</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {groupedBooks.map((group) => (
      <div key={group.key} className="space-y-2">
        {groupByGenre === "primary_genre" && (
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-semibold">{group.label}</h4>
          </div>
        )}
      {group.books.map((book) => {
        const isActive = book.id === activeBookId;
        return (
          <div key={book.id} className={`flex gap-3 rounded-lg border p-3 ${isActive ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
            <div className="w-12 h-16 shrink-0 overflow-hidden rounded">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <BookOpen className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                  {formatBookGenres(book) && (
                    <p className="text-xs text-muted-foreground mt-1">Жанры: {formatBookGenres(book)}</p>
                  )}
                </div>
                {isActive && <Badge variant="outline" className="text-xs shrink-0 border-primary/40 text-primary">Активная</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {isMember && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLocation(`/clubs/${clubId}/books/${book.id}/read`)}>
                    <BookOpen className="w-3 h-3 mr-1" />
                    Читать
                  </Button>
                )}
                {isMember && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleOpenRecommendDialog(book)}>
                    <Share2 className="w-3 h-3 mr-1" />
                    Порекомендовать
                  </Button>
                )}
                {isOwner && !isActive && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSetActive(book.id)} disabled={setActiveBook.isPending}>
                    <Star className="w-3 h-3 mr-1" />
                    Сделать активной
                  </Button>
                )}
                {isOwner && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(book)} disabled={deleteBookMutation.isPending}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
      ))}

      <Dialog open={!!recommendBook} onOpenChange={() => setRecommendBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Порекомендовать книгу</DialogTitle>
            <DialogDescription>
              Выберите подписчиков и/или пользователей, на которых вы подписаны. Отправятся только метаданные книги и ваш комментарий.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{recommendBook?.title}</p>
              <p className="text-muted-foreground">{recommendBook?.author}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="club-recommend-comment">Комментарий</Label>
              <Textarea
                id="club-recommend-comment"
                placeholder="Почему рекомендуете эту книгу?"
                maxLength={500}
                value={recommendComment}
                onChange={(e) => setRecommendComment(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="club-recommend-select-all"
                  checked={allTargetsSelected}
                  onCheckedChange={(checked) => handleToggleSelectAllTargets(checked === true)}
                />
                <Label htmlFor="club-recommend-select-all">Выбрать всех</Label>
              </div>
              <span className="text-xs text-muted-foreground">Выбрано: {recommendSelectedUserIds.size}</span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {renderRecommendTargetsList()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecommendBook(null)}>
              Отмена
            </Button>
            <Button onClick={() => void handleSendBookRecommendation()} disabled={recommendSending || recommendLoading}>
              {recommendSending ? "Отправляем..." : "Отправить рекомендацию"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component: Club Content Tabs
interface ClubContentTabsProps {
  readonly clubId: string;
  readonly isMember: boolean;
  readonly isOwner: boolean;
  readonly currentUserId: string;
  readonly settings: ClubSettings;
  readonly scheduleItems: ScheduleItem[];
  readonly activeBookId: string | null | undefined;
  readonly setLocation: (path: string) => void;
  readonly showLibrary?: boolean;
  readonly extraTabs?: Array<{ value: string; label: string; content: React.ReactNode }>;
}

export function ClubContentTabs({ clubId, isMember, isOwner, currentUserId, settings, scheduleItems, activeBookId, setLocation, showLibrary = isMember, extraTabs = [] }: ClubContentTabsProps) {
  const isMobile = useIsMobile();
  const initialTabFromQuery = new URLSearchParams(globalThis.location.search).get('tab');
  const [activeTab, setActiveTab] = useState(initialTabFromQuery === 'discussion' ? 'discussion' : 'about');
  const tabOptions = [
    { value: "about", label: "О клубе" },
    { value: "reading-plan", label: "План чтения" },
    { value: "discussion", label: "Обсуждение" },
    { value: "schedule", label: "Расписание" },
    ...extraTabs.map(({ value, label }) => ({ value, label })),
    ...(showLibrary ? [{ value: "library", label: "Библиотека" }] : []),
  ];

  const triggerClassName = "rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium";

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {isMobile ? (
        <div className="mb-4 sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue placeholder="Выберите раздел клуба" />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <TabsList className="hidden h-auto w-full justify-start gap-6 overflow-x-auto whitespace-nowrap border-b rounded-none bg-transparent px-0 py-0 sm:flex">
        {tabOptions.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className={triggerClassName}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="reading-plan" className="pt-6 animate-in slide-in-from-bottom-2">
        {isMember ? (
          <ReadingPlan clubId={clubId} isOwner={isOwner} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-secondary/20 rounded-xl border border-dashed">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">План чтения</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Вступите в клуб, чтобы видеть план чтения и отслеживать прогресс.
              </p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="about" className="pt-6 space-y-6 animate-in slide-in-from-bottom-2">
        {settings.welcomeHtml || settings.welcomeTitle ? (
          <div className="space-y-4">
            {settings.welcomeTitle && (
              <h3 className="text-2xl font-serif font-bold">{settings.welcomeTitle}</h3>
            )}
            {settings.welcomeHtml && (
              <div
                className="prose prose-stone dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: settings.welcomeHtml }}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Владелец клуба еще не добавил приветственное сообщение.
            </p>
          </div>
        )}

        <Separator />

        <div>
          <h4 className="font-semibold mb-3">Правила клуба</h4>
          {settings.rulesHtml ? (
            <div
              className="prose prose-stone dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: settings.rulesHtml }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">У этого клуба пока нет правил.</p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="discussion" className="pt-6">
        {isMember ? (
          <ClubDiscussionBoard 
            clubId={clubId} 
            isOwner={isOwner}
            currentUserId={currentUserId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-secondary/20 rounded-xl border border-dashed">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
              <MessageCircle className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Доска обсуждений</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Вступите в клуб, чтобы участвовать в обсуждениях.
              </p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="schedule" className="pt-6">
        <div className="space-y-4">
          {scheduleItems.length > 0 ? (
            scheduleItems.map((item) => {
              const eventDate = new Date(item.date);
              const isPast = eventDate < new Date();
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center ${isPast ? "opacity-60" : ""}`}
                >
                  <div
                    className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold leading-none ${isPast ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
                  >
                    <span className="text-xs uppercase">
                      {eventDate.toLocaleDateString("ru-RU", { month: "short" })}
                    </span>
                    <span className="text-lg">{eventDate.getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{item.title}</h4>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-1">{item.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.time}
                      </span>
                    </div>
                  </div>
                  {!isPast && (
                    <Button size="sm" variant="secondary" className="w-full sm:w-auto" asChild>
                      <a href={`/api/schedule/${item.id}/calendar.ics`} target="_blank" rel="noreferrer">
                        Добавить в календарь
                      </a>
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Расписание заседаний еще не составлено</p>
            </div>
          )}
        </div>
      </TabsContent>

      {showLibrary ? (
        <TabsContent value="library" className="pt-6 animate-in slide-in-from-bottom-2">
          <ClubLibraryTab
            clubId={clubId}
            activeBookId={activeBookId}
            isOwner={isOwner}
            isMember={isMember}
            setLocation={setLocation}
          />
        </TabsContent>
      ) : null}

      {extraTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="pt-6 animate-in slide-in-from-bottom-2">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
