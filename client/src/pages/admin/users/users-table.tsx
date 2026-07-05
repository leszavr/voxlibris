import { Mic2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { UserActionsMenu } from "./actions-menu";
import { UserRoleBadge, UserStatusBadge } from "./badges";
import type { User } from "./types";

export function UsersTable({ users, selectedIds, onToggleUser, onToggleAll }: Readonly<{ users: User[]; selectedIds: Set<string>; onToggleUser: (id: string) => void; onToggleAll: (users: User[]) => void }>) {
  const allSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="w-10 p-4">
              <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(users)} aria-label="Выбрать всех пользователей в списке" />
            </th>
            <th className="text-left p-4 font-medium text-gray-600">Пользователь</th>
            <th className="text-left p-4 font-medium text-gray-600">Роль</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Активность</th>
            <th className="text-left p-4 font-medium text-gray-600">Статистика</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => onToggleUser(user.id)} aria-label={`Выбрать ${user.username}`} />
              </td>
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{user.full_name || user.username}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                  <div className="text-xs text-gray-400">@{user.username}</div>
                </div>
              </td>
              <td className="p-4">
                <div className="flex flex-wrap gap-1.5">
                  <UserRoleBadge role={user.role} />
                  {user.can_create_reader_led_clubs && (
                    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
                      <Mic2 className="w-3 h-3 mr-1" />
                      ПРО-чтец
                    </Badge>
                  )}
                </div>
              </td>
              <td className="p-4">
                <UserStatusBadge status={user.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>
                    Регистрация:{" "}
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("ru") : "-"}
                  </div>
                  <div className="text-gray-500">
                    Последний вход:{" "}
                    {user.last_active && !Number.isNaN(new Date(user.last_active).getTime())
                      ? new Date(user.last_active).toLocaleDateString("ru")
                      : "Никогда"}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>{user.books_read ?? 0} книг прочитано</div>
                  <div className="text-gray-500" title="Клубы: сколько пользователь создал клубов и в скольких клубах состоит как участник">
                    Создал: {user.clubs_created ?? 0} / Участник: {user.clubs_joined ?? 0}
                  </div>
                </div>
              </td>
              <td className="p-4 text-right">
                <UserActionsMenu user={user} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Пользователь</th>
            <th className="text-left p-4 font-medium text-gray-600">Роль</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Активность</th>
            <th className="text-left p-4 font-medium text-gray-600">Статистика</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, idx) => ({ id: `skeleton-${idx}` })).map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-20" />
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-20" />
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </td>
              <td className="p-4 text-right">
                <Skeleton className="h-8 w-8" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
