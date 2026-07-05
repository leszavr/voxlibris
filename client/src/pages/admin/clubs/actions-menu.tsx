import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle, Eye, Loader2, Lock, MoreHorizontal, Settings, Unlock, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { modalAlert } from "@/hooks/use-toast";

import { approveClub, deleteClub, rejectClub, updateClubPrivacy, updateClubStatus } from "./api";
import type { Club } from "./types";

export function ClubActionsMenu({ 
  club, 
  onEditMaxMembers, 
  onTransferOwnership 
}: Readonly<{ 
  club: Club; 
  onEditMaxMembers: (club: Club) => void;
  onTransferOwnership: (club: Club) => void;
}>) {
  const queryClient = useQueryClient();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const deleteClubMutation = useMutation({
    mutationFn: (clubId: string) => deleteClub(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ clubId, status }: { clubId: string; status: string }) =>
      updateClubStatus(clubId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });

  const approveClubMutation = useMutation({
    mutationFn: (clubId: string) => approveClub(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectClubMutation = useMutation({
    mutationFn: ({ clubId, reason }: { clubId: string; reason: string }) => 
      rejectClub(clubId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setRejectDialogOpen(false);
      setRejectReason("");
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePrivacyMutation = useMutation({
    mutationFn: ({ clubId, isPublic }: { clubId: string; isPublic: boolean }) =>
      updateClubPrivacy(clubId, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) {
      void modalAlert({
        title: "Ошибка",
        description: "Пожалуйста, укажите причину отклонения",
        variant: "destructive",
      });
      return;
    }
    rejectClubMutation.mutate({ clubId: club.id, reason: rejectReason });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/clubs/${club.id}`} target="_blank" rel="noopener noreferrer">
              <Eye className="w-4 h-4 mr-2" />
              Просмотреть детали
            </a>
          </DropdownMenuItem>

          {/* Переключение приватности клуба */}
          <DropdownMenuItem
            onClick={() => togglePrivacyMutation.mutate({
              clubId: club.id,
              isPublic: !club.is_public
            })}
            disabled={togglePrivacyMutation.isPending}
            className={club.is_public ? "text-amber-600" : "text-green-600"}
          >
            {club.is_public ? (
              <Lock className="w-4 h-4 mr-2" />
            ) : (
              <Unlock className="w-4 h-4 mr-2" />
            )}
            {club.is_public ? "Сделать приватным" : "Сделать публичным"}
          </DropdownMenuItem>

          {/* Кнопки модерации для pending клубов */}
          {club.status === 'pending' && (
            <>
              <DropdownMenuItem
                onClick={() => approveClubMutation.mutate(club.id)}
                disabled={approveClubMutation.isPending}
                className="text-green-600"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Одобрить клуб
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRejectDialogOpen(true)}
                disabled={rejectClubMutation.isPending}
                className="text-red-600"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Отклонить клуб
              </DropdownMenuItem>
            </>
          )}
          
          {/* Обычные действия для других статусов */}
          {club.status !== 'pending' && (
            <>
              <DropdownMenuItem onClick={() => onEditMaxMembers(club)}>
                <Settings className="w-4 h-4 mr-2" />
                Изменить лимит участников
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTransferOwnership(club)}>
                <UserCog className="w-4 h-4 mr-2" />
                Передать владельца
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'pending' })}
                disabled={updateStatusMutation.isPending}
                className="text-amber-600"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Отправить на модерацию
              </DropdownMenuItem>
            </>
          )}
          
          {club.status === 'recruiting' && (
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'active' })}
              disabled={updateStatusMutation.isPending}
              className="text-green-600"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Активировать
            </DropdownMenuItem>
          )}
          {club.status === 'active' && (
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'completed' })}
              disabled={updateStatusMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Завершить
            </DropdownMenuItem>
          )}
          {club.status !== 'pending' && (
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ 
                clubId: club.id, 
                status: club.status === 'archived' ? 'active' : 'archived' 
              })}
              disabled={updateStatusMutation.isPending}
              className={club.status === 'archived' ? 'text-green-600' : 'text-gray-600'}
            >
              {club.status === 'archived' ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Восстановить
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Архивировать
                </>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => deleteClubMutation.mutate(club.id)}
            disabled={deleteClubMutation.isPending}
            className="text-red-600"
          >
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Диалог отклонения клуба */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить клуб "{club.name}"</DialogTitle>
            <DialogDescription>
              Укажите причину отклонения. Эта информация будет сохранена и может быть отправлена создателю клуба.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reject-reason">Причина отклонения</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Клуб не соответствует правилам сообщества..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
              }}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={rejectClubMutation.isPending}
            >
              {rejectClubMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отклоняем...
                </>
              ) : (
                "Отклонить клуб"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

