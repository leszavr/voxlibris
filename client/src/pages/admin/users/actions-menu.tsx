import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, BellRing, CheckCircle, KeyRound, LogIn, Mic2, MoreHorizontal, Pencil, RotateCcw, Shield, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { modalAlert } from "@/hooks/use-toast";
import { startImpersonation } from "@/lib/token-store";

import { deleteUser, impersonateUser, permanentDeleteUser, resetUserPassword, restoreUser, sendTestPush, updateReaderLedPermission, updateUserFields, updateUserRole, updateUserStatus } from "./api";
import type { User, UsersResponse } from "./types";

export function UserActionsMenu({ user }: Readonly<{ user: User }>) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { refetchUser } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editUsername, setEditUsername] = useState(user.username);
  const [editEmail, setEditEmail] = useState(user.email);
  const [editError, setEditError] = useState<string | null>(null);

  const editFieldsMutation = useMutation({
    mutationFn: (fields: { username?: string; email?: string }) => updateUserFields(user.id, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/v1/admin/users"] });
      setShowEditDialog(false);
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Ошибка сохранения");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ username, role }: { username: string; role: string }) =>
      updateUserRole(username, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось изменить роль",
        description: error instanceof Error ? error.message : "Произошла ошибка при изменении роли",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ username, status }: { username: string; status: string }) =>
      updateUserStatus(username, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
      setShowDeleteDialog(false);
    },
  });

  const restoreUserMutation = useMutation({
    mutationFn: (userId: string) => restoreUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
    },
  });

  const permanentDeleteUserMutation = useMutation({
    mutationFn: (userId: string) => permanentDeleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
      setShowPermanentDeleteDialog(false);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: () => {
      setShowResetDialog(false);
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось отправить письмо",
        description: error instanceof Error ? error.message : "Ошибка сброса пароля",
        variant: "destructive",
      });
    },
  });

  const testPushMutation = useMutation({
    mutationFn: (userId: string) => sendTestPush(userId),
    onSuccess: (data) => {
      void modalAlert({
        title: data.sent > 0 ? "Push отправлен" : "Push не отправлен",
        description: data.sent > 0
          ? `Отправлено подписок: ${data.sent}.`
          : data.message,
        variant: data.sent > 0 ? "default" : "destructive",
      });
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось отправить push",
        description: error instanceof Error ? error.message : "Ошибка отправки тестового push-уведомления",
        variant: "destructive",
      });
    },
  });

  const readerLedPermissionMutation = useMutation({
    mutationFn: (allowed: boolean) => updateReaderLedPermission(user.id, allowed),
    onSuccess: (_data, allowed) => {
      queryClient.setQueriesData<UsersResponse>({ queryKey: ["admin-users"] }, (current) => {
        if (!current) return current;

        return {
          ...current,
          users: current.users.map((currentUser) => currentUser.id === user.id
            ? { ...currentUser, can_create_reader_led_clubs: allowed }
            : currentUser),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось изменить ПРО-допуск",
        description: error instanceof Error ? error.message : "Ошибка сохранения права чтеца",
        variant: "destructive",
      });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => impersonateUser(userId),
    onSuccess: async (data) => {
      // Запускаем режим имперсонации
      startImpersonation(data.accessToken, data.user.username);
      // Очищаем все кеши React Query, чтобы данные загрузились заново для нового пользователя
      queryClient.clear();
      // Обновляем данные пользователя
      await refetchUser();
      // Перенаправляем на главную страницу
      setLocation("/");
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Ошибка входа",
        description: error instanceof Error ? error.message : "Не удалось войти под пользователем",
        variant: "destructive",
      });
    },
  });

  // Если пользователь удален, показываем только опции восстановления и окончательного удаления
  // Статус 'deleted' теперь типизирован в интерфейсе User
  if (user.status === "deleted") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => restoreUserMutation.mutate(user.id)}
              disabled={restoreUserMutation.isPending}
              className="text-green-600"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Восстановить
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowPermanentDeleteDialog(true)}
              disabled={permanentDeleteUserMutation.isPending}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить окончательно
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={showPermanentDeleteDialog} onOpenChange={setShowPermanentDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Окончательное удаление</AlertDialogTitle>
              <AlertDialogDescription>
                Вы уверены, что хотите <strong>окончательно удалить</strong> пользователя{" "}
                <strong>{user.username}</strong>?
                <br />
                <br />
                <span className="text-red-600 font-semibold">
                  Это действие невозможно отменить! Все данные пользователя будут удалены навсегда.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={permanentDeleteUserMutation.isPending}>
                Отмена
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => permanentDeleteUserMutation.mutate(user.id)}
                disabled={permanentDeleteUserMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {permanentDeleteUserMutation.isPending ? "Удаление..." : "Удалить окончательно"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Для обычных пользователей показываем стандартное меню
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user.status === "pending" && (
            <DropdownMenuItem
              onClick={() =>
                updateStatusMutation.mutate({ username: user.username, status: "active" })
              }
              disabled={updateStatusMutation.isPending}
              className="text-green-600"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Активировать
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              updateRoleMutation.mutate({ username: user.username, role: "admin" })
            }
            disabled={user.role === "admin" || updateRoleMutation.isPending}
            className="text-purple-600"
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Сделать администратором
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updateRoleMutation.mutate({ username: user.username, role: "moderator" })
            }
            disabled={user.role === "moderator" || updateRoleMutation.isPending}
          >
            <Shield className="h-4 w-4 mr-2" />
            Сделать модератором
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => updateRoleMutation.mutate({ username: user.username, role: "user" })}
            disabled={user.role === "user" || updateRoleMutation.isPending}
          >
            <UserIcon className="h-4 w-4 mr-2" />
            Сделать пользователем
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updateStatusMutation.mutate({
                username: user.username,
                status: user.status === "suspended" ? "active" : "suspended",
              })
            }
            disabled={updateStatusMutation.isPending}
            className={user.status === "suspended" ? "text-green-600" : "text-orange-600"}
          >
            {user.status === "suspended" ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Разблокировать
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Заблокировать
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => readerLedPermissionMutation.mutate(!user.can_create_reader_led_clubs)}
            disabled={readerLedPermissionMutation.isPending}
            className={user.can_create_reader_led_clubs ? "text-orange-600" : "text-amber-700"}
          >
            <Mic2 className="h-4 w-4 mr-2" />
            {user.can_create_reader_led_clubs ? "Отозвать ПРО-чтеца" : "Выдать ПРО-чтеца"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setEditUsername(user.username);
              setEditEmail(user.email);
              setEditError(null);
              setShowEditDialog(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Редактировать
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowResetDialog(true)}
            disabled={resetPasswordMutation.isPending}
            className="text-orange-600"
          >
            <KeyRound className="h-4 w-4 mr-2" />
            Сбросить пароль
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => testPushMutation.mutate(user.id)}
            disabled={testPushMutation.isPending}
            className="text-indigo-600"
          >
            <BellRing className="h-4 w-4 mr-2" />
            {testPushMutation.isPending ? "Отправляем push..." : "Отправить тестовый push"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => impersonateMutation.mutate(user.id)}
            disabled={impersonateMutation.isPending || user.role === 'admin'}
            className="text-blue-600"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Зайти как...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteUserMutation.isPending}
            className="text-red-600"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтверждение удаления</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить пользователя <strong>{user.username}</strong>?
              Пользователь будет помечен как удаленный и перемещен в список удаленных. Вы сможете
              восстановить его позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserMutation.mutate(user.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUserMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сброс пароля</AlertDialogTitle>
            <AlertDialogDescription>
              Отправить пользователю <strong>{user.username}</strong> письмо со ссылкой для сброса пароля?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPasswordMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetPasswordMutation.mutate(user.id)}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "Отправляем..." : "Отправить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Только A-Za-z0-9_-, 3–32 символа"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Отмена</Button>
            <Button
              onClick={() => {
                const fields: { username?: string; email?: string } = {};
                if (editUsername !== user.username) fields.username = editUsername;
                if (editEmail !== user.email) fields.email = editEmail;
                if (Object.keys(fields).length > 0) editFieldsMutation.mutate(fields);
                else setShowEditDialog(false);
              }}
              disabled={editFieldsMutation.isPending}
            >
              {editFieldsMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

