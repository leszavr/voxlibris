import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { InvitationsList } from "@/components/club/invitations-list";
import { MainLayout } from "@/components/layout/MainLayout";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { LiveReadersBubble, ActiveReadersModal } from "@/components/studio/LiveReadersBubble";
import { ListenerOverlay } from "@/components/studio/ListenerOverlay";
import { useLiveReaders } from "@/hooks/use-live-readers";
import { useClubLiveListening } from "@/hooks/use-club-live-listening";
import { useClubPresence } from "@/hooks/use-club-presence";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteClubBook } from "@/hooks/use-books-v2";
import { useClub, useClubMembers, useRemoveMember } from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";
import { ClubCalendarCard, ClubHeader, CurrentBookCard, MembersListCard } from "./club-details/sidebar";
import { ClubContentTabs } from "./club-details/tabs";
import { ClubLoading, ClubNotFound, parseClubSettings, parseSchedule, useClubActions, useClubErrorHandling, useClubPermissions } from "./club-details/shared";

export { ClubContentTabs } from "./club-details/tabs";

export default function ClubDetails() {
  const isMobile = useIsMobile();
  const [, params] = useRoute("/clubs/:id");
  const clubId = params?.id || "";
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canLoadClubData = !!clubId && !authLoading;
  const { data: clubData, isLoading, error } = useClub(clubId, canLoadClubData);
  const viewerMembershipRole = clubData?.viewerMembershipRole ?? null;
  const isOwnerByOwnerId = Boolean(user?.id && (clubData?.ownerId === user.id || clubData?.owner?.id === user.id));
  const canViewMembers = Boolean(viewerMembershipRole) || isOwnerByOwnerId || ['admin', 'moderator'].includes(user?.role ?? '');
  const canLoadMembersData = !!clubId && isAuthenticated && !authLoading && canViewMembers;
  const { data: membersData, isLoading: membersLoading } = useClubMembers(clubId, canLoadMembersData);
  const removeMemberMutation = useRemoveMember();
  const deleteBookMutation = useDeleteClubBook(clubId);

  // Вызываем все хуки безусловно (правила React Hooks)
  const errorComponent = useClubErrorHandling(error, setLocation);
  
  const members = Array.isArray(membersData) ? membersData : [];
  const permissions = useClubPermissions(viewerMembershipRole, user);
  const isOwner = permissions.isOwner || isOwnerByOwnerId;
  const { isModerator } = permissions;
  const isMember = permissions.isMember || isOwner;
  const canRemove = (memberRole: string, memberId: string) => {
    if (!user?.id || memberId === user.id) return false;
    if (isOwner) return memberRole !== "owner";
    if (isModerator) return memberRole === "member";
    return false;
  };

  const { handleRemoveMember, handleDeleteBook, handleLeaveClub, handleCleanupChat } = useClubActions({
    clubId,
    club: clubData || null,
    user,
    isOwner,
    toast,
    setLocation,
    removeMemberMutation,
    deleteBookMutation
  });

  // Присутствие на странице клуба — real-time обновление через WebSocket
  useClubPresence(isAuthenticated && !authLoading ? clubId : null, (ids) => {
    queryClient.setQueryData(["/api/presence/club", clubId], { onlineUserIds: ids });
  });

  // Live-чтецы (хук вызывается безусловно, bookId может быть пустым)
  const activeBookId = clubData?.bookId ?? "";
  const { readers, flashCount } = useLiveReaders({
    clubId,
    bookId: activeBookId,
    listeningToSessionId: null,
  });
  const {
    listeningState,
    listeningReader,
    startListening,
    stopListening,
  } = useClubLiveListening({
    clubId,
    bookId: activeBookId,
    bookTitle: clubData?.book?.title ?? "",
    bookAuthor: clubData?.book?.author ?? undefined,
    coverUrl: clubData?.book?.coverUrl ?? null,
  });

  // Теперь обрабатываем условия после всех хуков
  if (!clubId) return <ClubNotFound />;
  if (authLoading) return <ClubLoading />;
  if (isLoading) return <ClubLoading />;
  if (errorComponent) return errorComponent;

  if (!clubData) {
    return (
      <MainLayout>
        <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
          <p className="text-muted-foreground">Клуб не найден</p>
        </div>
      </MainLayout>
    );
  }

  // После всех проверок clubData гарантированно не null
  const club = clubData;
  const settings = parseClubSettings(clubData.settings);
  const scheduleItems = parseSchedule(clubData.schedule);

  // Диагностический лог только для режима разработки
  if (import.meta.env.DEV) {
    console.warn("[ClubDetails] Загружены настройки клуба:", {
      rawSettings: clubData.settings,
      parsedSettings: settings,
      welcomeHtml: settings.welcomeHtml?.substring(0, 50),
      rulesHtml: settings.rulesHtml?.substring(0, 50),
    });
  }

  return (
    <MainLayout>
      <div className={cn("transition-[filter] duration-300", listeningState && "blur-sm pointer-events-none select-none")}>
        <ClubHeader 
          club={club}
          members={members}
          isOwner={isOwner}
          isMember={isMember}
          removeMemberMutation={removeMemberMutation}
          handleLeaveClub={handleLeaveClub}
          setLocation={setLocation}
          user={user}
          onOwnershipTransferred={() => {
            queryClient.invalidateQueries({ queryKey: ["club", clubId] });
            queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
            globalThis.location.reload();
          }}
        />

        <div className="container grid grid-cols-1 gap-4 px-4 py-6 sm:gap-6 sm:px-6 md:px-12 md:py-8 lg:grid-cols-3 lg:gap-8 xl:gap-12">
          <div className="order-1 space-y-6 lg:col-span-1 lg:space-y-8">
            <CurrentBookCard
              club={club}
              clubId={clubId}
              isOwner={isOwner}
              isMember={isMember}
              handleDeleteBook={handleDeleteBook}
              deleteBookMutation={deleteBookMutation}
              setLocation={setLocation}
            />

            <MembersListCard
              clubId={clubId}
              clubTitle={club.title}
              members={members}
              memberCount={club.memberCount || members.length}
              membersLoading={membersLoading}
              canViewMembers={canViewMembers}
              isOwner={isOwner}
              isModerator={isModerator}
              canRemove={canRemove}
              handleRemoveMember={handleRemoveMember}
            />

            <ClubCalendarCard club={club} isMember={isMember} />

            {(isOwner || isModerator) && (
              <div className="space-y-3">
                <InvitationsList clubId={clubId} isOwner={isOwner} />
              </div>
            )}
          </div>

          <div className="order-2 lg:col-span-2">
            <ClubContentTabs
              clubId={clubId}
              isMember={isMember}
              isOwner={isOwner}
              currentUserId={user?.id || ''}
              settings={settings}
              scheduleItems={scheduleItems}
              activeBookId={club.bookId}
              setLocation={setLocation}
            />
          </div>
        </div>

        {isAuthenticated && isMember && (
          <ChatWidget 
            clubId={club.id} 
            onCleanupDeleted={() => handleCleanupChat(0)}
            canCleanup={isOwner}
            mobileBottomOffsetPx={88}
            mobileTopOffsetPx={76}
          />
        )}

        {isAuthenticated && isMember && activeBookId && (
          <div className={cn(
            "fixed z-30 transition-transform duration-300 ease-out",
            isMobile
              ? "bottom-[calc(env(safe-area-inset-bottom)+9rem)] right-3 translate-x-0 pr-0"
              : "bottom-20 right-0 translate-x-[calc(100%-4rem)] pr-4 hover:translate-x-0 focus-within:translate-x-0",
          )}>
            <LiveReadersBubble
              readers={readers}
              flashCount={flashCount}
              onOpenModal={() => setLiveModalOpen(true)}
              compact={isMobile}
            />
          </div>
        )}
      </div>

      {isAuthenticated && isMember && activeBookId && (
        <ActiveReadersModal
          open={liveModalOpen}
          onClose={() => setLiveModalOpen(false)}
          readers={readers}
          listeningToSessionId={listeningReader?.sessionId ?? null}
          onPlay={async (reader) => {
            await startListening(reader);
          }}
          onStop={async () => {
            stopListening();
          }}
        />
      )}

      {listeningState && (
        <ListenerOverlay
          reader={listeningState.reader}
          bookTitle={listeningState.bookTitle}
          bookAuthor={listeningState.bookAuthor}
          coverUrl={listeningState.coverUrl}
          isPaused={Boolean(listeningState.reader.isPaused)}
          onStop={() => stopListening()}
          onStreamEnded={() => stopListening({ stopPlayback: false })}
        />
      )}
    </MainLayout>
  );
}
