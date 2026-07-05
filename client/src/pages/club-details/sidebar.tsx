import type { ClubWithDetails } from "@shared/schema";
import { useState } from "react";
import { ArrowLeft, BookOpen, Calendar, Edit2, Loader2, LogOut, MoreHorizontal, Trash2, UserCheck, UserX, Volume2, VolumeX, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getClubCoverUrl } from "@/lib/club-cover";
import { ClubSettingsModal } from "@/components/club/club-settings-modal";
import { TransferOwnershipDialog } from "@/components/club/TransferOwnershipDialog";
import { EditClubBookDialog } from "@/components/club/EditClubBookDialog";
import { BookDescriptionDialog } from "@/components/club/BookDescriptionDialog";
import { InviteMemberModal } from "@/components/club/invite-member-modal";
import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { UserContextMenu } from "@/components/social/UserContextMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import { Textarea } from "@/components/ui/textarea";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useModerateClubMember, type ClubMemberWithUser } from "@/hooks/use-clubs";
import type { AuthUserClient } from "@/lib/auth";
import type { ClubWithOptionalBook, DeleteBookMutation, RemoveMemberMutation } from "./shared";
import { getAchievementIconSymbol, getMemberRoleBadgeVariant, getRestrictionInfo } from "./shared";

interface ClubHeaderProps {
  readonly club: ClubWithOptionalBook;
  readonly members: ClubMemberWithUser[];
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly removeMemberMutation: RemoveMemberMutation;
  readonly handleLeaveClub: () => void;
  readonly setLocation: (path: string) => void;
  readonly user: AuthUserClient | null;
  readonly onOwnershipTransferred: () => void;
}

export function ClubHeader({ club, members, isOwner, isMember, removeMemberMutation, handleLeaveClub, setLocation, user, onOwnershipTransferred }: ClubHeaderProps) {
  return (
    <div className="relative min-h-[18rem] w-full overflow-hidden md:min-h-[22rem] lg:min-h-[26rem]">
      <img
        src={getClubCoverUrl(club.coverImage)}
        alt={club.title}
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="container relative flex h-full flex-col justify-between px-4 py-6 sm:px-6 md:px-12 md:py-8">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/clubs")}
            className="h-9 w-full justify-center text-white hover:bg-white/20 sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к моим клубам
          </Button>
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {club.isPrivate && (
                <Badge
                  variant="secondary"
                  className="bg-yellow-500/20 text-yellow-200 border-none"
                >
                  Приватный
                </Badge>
              )}
              {club.tags?.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-accent text-accent-foreground border-none"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <h1 className="text-3xl font-serif font-bold text-white shadow-sm sm:text-4xl md:text-5xl">
              {club.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" /> {club.memberCount || members.length}/
                {club.maxMembers} Участников
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Создан{" "}
                {new Date(club.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap md:justify-end">
            {isMember && (
              <>
                {isOwner && (
                  <>
                    <ClubSettingsModal club={club} />
                    {user && members.length > 1 && (
                      <TransferOwnershipDialog
                        clubId={club.id}
                        clubTitle={club.title}
                        members={members}
                        currentUserId={user.id}
                        onSuccess={onOwnershipTransferred}
                      />
                    )}
                  </>
                )}
                {!isOwner && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full bg-white/10 text-white border-white/20 hover:bg-white/20 sm:w-auto"
                    onClick={handleLeaveClub}
                    disabled={removeMemberMutation.isPending}
                  >
                    {removeMemberMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Выходим...
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 mr-2" />
                        Выйти из клуба
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component: Current Book Card
interface CurrentBookCardProps {
  readonly club: ClubWithOptionalBook;
  readonly clubId: string;
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly handleDeleteBook: () => void;
  readonly deleteBookMutation: DeleteBookMutation;
  readonly setLocation: (path: string) => void;
}

export function CurrentBookCard({ club, clubId, isOwner, isMember, handleDeleteBook, deleteBookMutation, setLocation }: CurrentBookCardProps) {
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 font-serif text-lg font-bold sm:text-xl">Текущая книга</h3>
      {club.book ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full max-w-[7rem] shrink-0 overflow-hidden rounded-md shadow-md sm:w-20 md:w-24">
              {club.book.coverUrl ? (
                <img
                  src={club.book.coverUrl}
                  alt={club.book.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-muted">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-semibold leading-tight">{club.book.title}</h4>
              <p className="text-sm text-muted-foreground">{club.book.author}</p>
              {club.book.description && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {club.book.description}
                  </p>
                  {club.book.description.length > 100 && (
                    <button
                      onClick={() => setShowDescriptionDialog(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Показать полностью...
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {isMember && club.book && (
              <Button
                onClick={() => {
                  if (!club.book) return;
                  setLocation(`/clubs/${clubId}/books/${club.book.id}/read`);
                }}
                className="w-full"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Читать
              </Button>
            )}
            {isOwner && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <EditClubBookDialog
                  book={{
                    id: club.book.id,
                    clubId: club.book.clubId,
                    title: club.book.title,
                    author: club.book.author,
                    description: club.book.description || undefined,
                    publicationYear: club.book.publicationYear || undefined,
                    genre: club.book.genre || undefined,
                    language: club.book.language || undefined,
                    format: club.book.format,
                    coverUrl: club.book.coverUrl || undefined,
                    uploadedByUserId: club.book.uploadedByUserId,
                    uploadedAt:
                      typeof club.book.uploadedAt === "string"
                        ? club.book.uploadedAt
                        : club.book.uploadedAt?.toISOString() || "",
                  }}
                  clubId={clubId}
                  onSave={() => globalThis.location.reload()}
                >
                  <Button variant="outline" className="w-full sm:flex-1">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Редактировать
                  </Button>
                </EditClubBookDialog>
                <VoxLibrisUpload
                  defaultContext="club"
                  clubId={clubId}
                  buttonText="Заменить"
                  buttonVariant="outline"
                  onSuccess={() => globalThis.location.reload()}
                />
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={handleDeleteBook}
                  disabled={deleteBookMutation.isPending}
                >
                  {deleteBookMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Удалить
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 space-y-4">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Загрузите книгу для начала совместного чтения"
              : "Владелец клуба еще не загрузил книгу"}
          </p>
          {isOwner && (
            <VoxLibrisUpload
              defaultContext="club"
              clubId={clubId}
              buttonText="Загрузить книгу"
              onSuccess={() => globalThis.location.reload()}
            />
          )}
        </div>
      )}

      {club.book?.description && (
        <BookDescriptionDialog
          open={showDescriptionDialog}
          onOpenChange={setShowDescriptionDialog}
          title={club.book.title}
          author={club.book.author}
          description={club.book.description}
        />
      )}
    </div>
  );
}

// Component: Members List Card
interface MembersListCardProps {
  readonly clubId: string;
  readonly clubTitle: string;
  readonly members: ClubMemberWithUser[];
  readonly memberCount: number;
  readonly membersLoading: boolean;
  readonly canViewMembers: boolean;
  readonly isOwner: boolean;
  readonly isModerator: boolean;
  readonly canRemove: (role: string, memberId: string) => boolean;
  readonly handleRemoveMember: (memberId: string, username: string) => void;
}

export function MembersListCard({ clubId, clubTitle, members, memberCount, membersLoading, canViewMembers, isOwner, isModerator, canRemove, handleRemoveMember }: MembersListCardProps) {
  const moderateMember = useModerateClubMember();
  const [moderationTarget, setModerationTarget] = useState<{ member: ClubMemberWithUser; action: "mute" | "deactivate" } | null>(null);
  const [moderationDate, setModerationDate] = useState("");
  const [moderationTime, setModerationTime] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const { data: presenceData } = useQuery<{ onlineUserIds: string[] }>({
    queryKey: ["/api/presence/club", clubId],
    queryFn: () => authFetch(`/api/presence/club/${clubId}`).then(r => r.json()) as Promise<{ onlineUserIds: string[] }>,
    refetchInterval: 15_000,
    staleTime: 0,
  });
  const onlineSet = new Set(presenceData?.onlineUserIds ?? []);

  const submitModeration = () => {
    if (!moderationTarget) return;
    const until = moderationDate && moderationTime ? new Date(`${moderationDate}T${moderationTime}`).toISOString() : null;
    moderateMember.mutate({
      clubId,
      userId: moderationTarget.member.id,
      action: moderationTarget.action,
      until,
      reason: moderationReason.trim() || null,
    });
    setModerationTarget(null);
    setModerationDate("");
    setModerationTime("");
    setModerationReason("");
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 flex flex-col gap-3 font-serif text-lg font-bold sm:flex-row sm:items-center sm:justify-between sm:text-xl">
        <span>Участники</span>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge variant="outline" className="font-sans font-normal text-xs">
            {membersLoading ? "Загрузка..." : `${memberCount} участников`}
          </Badge>
          {canViewMembers && (isOwner || isModerator) && (
            <InviteMemberModal clubId={clubId} clubTitle={clubTitle} />
          )}
        </div>
      </h3>
      {canViewMembers ? (
        <div className="space-y-4">
          {membersLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Загружаем участников...
              </span>
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1 sm:max-h-[32rem]">
              {members.map((member) => {
                const memberRating = (member.readerRating ?? 0) / 100;
                const compactAchievements = (member.achievements ?? []).slice(0, 3);
                const isMuted = member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false;
                const isDeactivated = member.isActive === false || (member.deactivatedUntil ? new Date(member.deactivatedUntil).getTime() > Date.now() : false);

                return (
                <div key={member.id} className="grid gap-3 rounded-xl border border-border/60 p-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:border-0 xl:p-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative shrink-0">
                      <UserContextMenu user={{ id: member.id, username: member.username, displayName: member.displayName }} actions={["profile"]}>
                        <div className="cursor-pointer">
                          <Avatar>
                            {member.avatar && <AvatarImage src={member.avatar} alt={member.displayName || member.username} />}
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                              {(member.displayName || member.username).substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </UserContextMenu>
                      {onlineSet.has(String(member.id)) && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.displayName || member.username}</p>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>
                          Присоединился {new Date(member.joinedAt).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>Рейтинг: {memberRating.toFixed(1)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {compactAchievements.map((achievement) => (
                          <div
                            key={achievement.achievementId}
                            title={achievement.titleRu}
                            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30 text-[10px]"
                          >
                            {achievement.badgeImageUrl ? (
                              <AchievementImagePreview
                                src={achievement.badgeImageUrl}
                                alt={achievement.titleRu}
                                triggerClassName="h-5 w-5"
                              />
                             ) : (
                               <span>
                                 {getAchievementIconSymbol(achievement.iconType)}
                               </span>
                             )}
                          </div>
                        ))}
                        {compactAchievements.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">Без достижений</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
                    <Badge variant={getMemberRoleBadgeVariant(member.role)} className="shrink-0">
                      {member.role === "owner" && "Владелец"}
                        {member.role === "moderator" && "Модератор"}
                        {member.role === "member" && "Участник"}
                    </Badge>
                    {isMuted && <Badge variant="secondary" title={getRestrictionInfo(member.mutedUntil, member.restrictionReason)}>Без права писать</Badge>}
                    {isDeactivated && <Badge variant="destructive" title={getRestrictionInfo(member.deactivatedUntil, member.restrictionReason)}>Доступ ограничен</Badge>}
                    {(isOwner || isModerator) && canRemove(member.role, member.id) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="justify-center"
                            title={isMuted ? "Разрешить писать" : "Запретить писать"}
                            aria-label={isMuted ? "Разрешить писать" : "Запретить писать"}
                            onClick={() => {
                              if (isMuted) {
                                moderateMember.mutate({ clubId, userId: member.id, action: "unmute" });
                              } else {
                                setModerationTarget({ member, action: "mute" });
                              }
                            }}
                          >
                            {isMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="justify-center"
                            title={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                            aria-label={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                            onClick={() => {
                              if (isDeactivated) {
                                moderateMember.mutate({ clubId, userId: member.id, action: "reactivate" });
                              } else {
                                setModerationTarget({ member, action: "deactivate" });
                              }
                            }}
                          >
                            {isDeactivated ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="justify-center text-destructive"
                            title="Исключить из клуба"
                            aria-label="Исключить из клуба"
                            onClick={() => handleRemoveMember(member.id, member.username)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          Список участников доступен только участникам клуба и модераторам.
        </div>
      )}
      <Dialog open={!!moderationTarget} onOpenChange={(open) => !open && setModerationTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moderationTarget?.action === "mute" ? "Запретить участнику писать" : "Ограничить доступ участника"}</DialogTitle>
            <DialogDescription>
              {moderationTarget?.member.displayName || moderationTarget?.member.username}. Дату можно не указывать — ограничение будет бессрочным до ручной отмены.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="moderation-date">Дата окончания</Label>
                <NativePickerInput id="moderation-date" type="date" value={moderationDate} onChange={(event) => setModerationDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moderation-time">Время окончания</Label>
                <NativePickerInput id="moderation-time" type="time" value={moderationTime} onChange={(event) => setModerationTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moderation-reason">Причина</Label>
              <Textarea id="moderation-reason" value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationTarget(null)}>Отмена</Button>
            <Button onClick={submitModeration}>Применить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ClubCalendarCard({ club, isMember }: { club: ClubWithDetails; isMember: boolean }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function openPrivateCalendar() {
    setLoading(true);
    try {
      const response = await authFetch(`/api/clubs/${club.id}/calendar-subscription`, { method: 'POST' });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || 'Не удалось создать календарную ссылку');
      window.location.href = data.url;
    } catch (error) {
      toast({ title: 'Ошибка', description: error instanceof Error ? error.message : 'Не удалось открыть календарь', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const publicUrl = `/api/clubs/${club.id}/calendar.ics`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-4 w-4" />Календарь клуба</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Скопируйте ссылку и добавьте её как подписку в Яндекс Календарь, Google Calendar, Apple Calendar или Outlook.</p>
        {!club.isPrivate ? (
          <Button variant="secondary" size="sm" asChild><a href={publicUrl}>Подписаться на календарь клуба</a></Button>
        ) : isMember ? (
          <div className="space-y-2">
            <Button variant="secondary" size="sm" onClick={openPrivateCalendar} disabled={loading}>
              {loading ? 'Готовим календарь...' : 'Добавить календарь в расписание'}
            </Button>
          </div>
        ) : (
          <p>Подписка доступна только участникам клуба.</p>
        )}
      </CardContent>
    </Card>
  );
}
