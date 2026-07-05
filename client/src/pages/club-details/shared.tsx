import type { ClubMemberRole, ClubWithDetails } from "@shared/schema";
import type { ClubDetailsResponse } from "@/hooks/use-clubs";
import type { AuthUserClient } from "@/lib/auth";
import type { FollowUser } from "@/api/social";
import type { useDeleteClubBook } from "@/hooks/use-books-v2";
import type { useRemoveMember } from "@/hooks/use-clubs";
import type { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Lock, LogIn } from "lucide-react";
import DOMPurify from "dompurify";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccessToken } from "@/lib/token-store";
import { modalConfirm } from "@/hooks/use-toast";

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  description?: string;
}

export interface ClubSettings {
  welcomeTitle?: string;
  welcomeHtml?: string;
  rulesHtml?: string;
  shortDescription?: string;
}

export function getRestrictionInfo(until?: Date | string | null, reason?: string | null): string {
  const untilText = until ? `до ${new Date(until).toLocaleString()}` : "бессрочно";
  return reason ? `${untilText}. Причина: ${reason}` : untilText;
}

export type ClubWithOptionalBook = ClubDetailsResponse & { book?: ClubDetailsResponse["book"] | null };
const RECOMMEND_PREFIX = "[RECOMMEND]";

export type BookRecommendationPayload = {
  type: "book";
  entityId: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  comment?: string | null;
};

export type DmConversationCreateResponse = {
  conversation: {
    id: string;
  };
};

export function encodeBookRecommendationPayload(payload: BookRecommendationPayload): string {
  return `${RECOMMEND_PREFIX}${JSON.stringify(payload)}`;
}

export async function loadAllFollowUsers(
  loader: (userId: string, limit: number, cursor?: string) => Promise<{ users: FollowUser[]; nextCursor: string | null }>,
  userId: string,
): Promise<FollowUser[]> {
  const all: FollowUser[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await loader(userId, 50, cursor);
    all.push(...page.users);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return all;
}

// Вспомогательная функция для получения варианта badge по роли
export const getMemberRoleBadgeVariant = (role: ClubMemberRole): "default" | "secondary" | "outline" => {
  if (role === "owner") return "default";
  if (role === "moderator") return "secondary";
  return "outline";
};

// Парсинг настроек клуба
export const parseClubSettings = (settings: string | null): ClubSettings => {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings) as ClubSettings;
    return {
      ...parsed,
      welcomeHtml: parsed.welcomeHtml
        ? DOMPurify.sanitize(parsed.welcomeHtml, {
            ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "b", "i", "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"],
            ALLOWED_ATTR: ["href", "target", "rel"],
          })
        : undefined,
      rulesHtml: parsed.rulesHtml
        ? DOMPurify.sanitize(parsed.rulesHtml, {
            ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "b", "i", "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"],
            ALLOWED_ATTR: ["href", "target", "rel"],
          })
        : undefined,
    };
  } catch {
    return {};
  }
};

// Парсинг расписания
export const parseSchedule = (schedule: string | null): ScheduleItem[] => {
  if (!schedule) return [];
  try {
    return JSON.parse(schedule) as ScheduleItem[];
  } catch {
    return [];
  }
};

// Получение символа для иконки достижения
export function getAchievementIconSymbol(iconType: string): string {
  if (iconType === "star") return "★";
  if (iconType === "title") return "T";
  return "🏅";
}

export const ClubNotFound = () => (
  <MainLayout>
    <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
      <p className="text-muted-foreground">Клуб не найден</p>
    </div>
  </MainLayout>
);

export const ClubLoading = () => (
  <MainLayout>
    <div className="container px-4 py-8 sm:px-6 md:px-12 md:py-12">
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загружаем клуб...</span>
      </div>
    </div>
  </MainLayout>
);

export const ClubAuthRequired = () => (
  <MainLayout>
    <div className="container flex justify-center px-4 py-8 sm:px-6 md:px-12 md:py-12">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <LogIn className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle>Требуется авторизация</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Доступ к клубам доступен только авторизованным пользователям. Войдите в систему
            или зарегистрируйтесь, чтобы присоединиться к клубам чтения.
          </p>
          <p className="text-sm text-muted-foreground">
            В будущих версиях вы сможете запросить приглашение в клуб прямо с карточки клуба.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild>
              <Link href="/auth/login">
                <LogIn className="h-4 w-4 mr-2" />
                Войти
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/auth/register">Зарегистрироваться</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </MainLayout>
);

export type RemoveMemberMutation = ReturnType<typeof useRemoveMember>;
export type DeleteBookMutation = ReturnType<typeof useDeleteClubBook>;
export type ToastFn = ReturnType<typeof useToast>['toast'];

// Helper functions to reduce cognitive complexity
export function useClubErrorHandling(error: unknown, setLocation: (path: string) => void) {
  if (!error) return null;

  const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
  const isAuthError = errorMessage.includes("Сессия истекла") ||
    errorMessage.includes("войдите") ||
    errorMessage.includes("401") ||
    errorMessage.includes("Authentication");
  
  if (isAuthError) return <ClubAuthRequired />;
  
  const isPrivateClubError = errorMessage.includes("закрытый клуб") ||
    errorMessage.includes("PRIVATE_CLUB_ACCESS_DENIED") ||
    errorMessage.includes("приглашение");
  
  if (isPrivateClubError) {
      return (
        <MainLayout>
          <div className="container flex justify-center px-4 py-8 sm:px-6 md:px-12 md:py-12">
            <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <CardTitle>Закрытый клуб</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Это закрытый клуб. Для доступа необходимо получить приглашение от участника клуба.
              </p>
              <p className="text-sm text-muted-foreground">
                В будущих версиях вы сможете запросить приглашение прямо с карточки клуба.
              </p>
              <Button variant="outline" onClick={() => setLocation("/clubs")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Вернуться к списку клубов
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
        <p className="text-red-600 mb-2">Ошибка загрузки клуба</p>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      </div>
    </MainLayout>
  );
}

export function useClubPermissions(currentUserRole: ClubMemberRole | null | undefined, user: AuthUserClient | null) {
  const isOwner = currentUserRole === "owner";
  const isModerator = currentUserRole === "moderator";
  const isMember = Boolean(currentUserRole);
  
  const canRemove = (memberRole: string, memberId: string) => {
    if (!user?.id || memberId === user.id) return false;
    if (isOwner) return memberRole !== "owner";
    if (isModerator) return memberRole === "member";
    return false;
  };
  
  return { isOwner, isModerator, isMember, canRemove };
}

export function useClubActions({
  clubId,
  club,
  user,
  isOwner,
  toast,
  setLocation,
  removeMemberMutation,
  deleteBookMutation,
}: {
  clubId: string;
  club: ClubWithDetails | null;
  user: AuthUserClient | null;
  isOwner: boolean;
  toast: ToastFn;
  setLocation: (path: string) => void;
  removeMemberMutation: RemoveMemberMutation;
  deleteBookMutation: DeleteBookMutation;
}) {
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    const confirmed = await modalConfirm({
      title: "Удалить участника?",
      description: `Удалить участника «${memberName}» из клуба?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await removeMemberMutation.mutateAsync({ clubId, userId: memberId });
      toast({ title: "Участник удалён", description: `${memberName} больше не состоит в клубе.` });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось удалить участника";
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async () => {
    if (!club?.book?.id) return;
    const confirmed = await modalConfirm({
      title: "Удалить книгу из клуба?",
      description: `Удалить книгу «${club.book.title}» из клуба? Это действие необратимо.`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteBookMutation.mutateAsync(club.book.id);
      toast({
        title: "Книга удалена",
        description: "Книга успешно удалена из клуба",
      });
      globalThis.location.reload();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось удалить книгу";
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleLeaveClub = async () => {
    if (!user?.id) return;
    if (isOwner) {
      toast({
        title: "Невозможно выйти",
        description: "Владелец не может покинуть клуб. Сначала передайте права другому участнику.",
        variant: "destructive",
      });
      return;
    }

    try {
      await removeMemberMutation.mutateAsync({ clubId, userId: user.id });
      toast({
        title: "Вы покинули клуб",
        description: "До новых встреч!",
      });
      setLocation("/clubs");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось выйти из клуба";
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleCleanupChat = async (olderThanDays: number) => {
    if (!isOwner) return;

    try {
      const res = await fetch(
        `/api/clubs/${clubId}/chat/cleanup?olderThanDays=${olderThanDays}`,
        {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken() || ""}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Не удалось очистить чат");
      }

      const data = await res.json().catch(() => ({}));
      toast({
        title: "Чат очищен",
        description: `Удалено сообщений: ${data.deletedCount ?? 0}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось очистить чат";
      toast({
        title: "Ошибка очистки чата",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return { handleRemoveMember, handleDeleteBook, handleLeaveClub, handleCleanupChat };
}
