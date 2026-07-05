import { Ban, CheckCircle, Clock, Mic2, Shield, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import type { User, UserGroupKey } from "./types";

export function UserStatusBadge({ status }: Readonly<{ status: User["status"] }>) {
  switch (status) {
    case "active":
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Активный
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Ожидает
        </Badge>
      );
    case "suspended":
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <Ban className="w-3 h-3 mr-1" />
          Заблокирован
        </Badge>
      );
    case "deleted":
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <Trash2 className="w-3 h-3 mr-1" />
          Удален
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function UserRoleBadge({ role }: Readonly<{ role: User["role"] }>) {
  switch (role) {
    case "admin":
      return (
        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Администратор
        </Badge>
      );
    case "moderator":
      return (
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
          <Shield className="w-3 h-3 mr-1" />
          Модератор
        </Badge>
      );
    case "user":
      return (
        <Badge variant="outline">
          <UserIcon className="w-3 h-3 mr-1" />
          Пользователь
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

export function groupUsers(users: User[], groupBy: UserGroupKey) {
  if (groupBy === "none") return [{ key: "all", title: "Все пользователи", users }];
  const groups = new Map<string, User[]>();
  for (const user of users) {
    const key = user[groupBy];
    groups.set(key, [...(groups.get(key) ?? []), user]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    title: groupBy === "role" ? `Роль: ${key}` : `Статус: ${key}`,
    users: group,
  }));
}

export function ReaderLedBadge() {
  return (
    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
      <Mic2 className="w-3 h-3 mr-1" />
      ПРО-чтец
    </Badge>
  );
}
