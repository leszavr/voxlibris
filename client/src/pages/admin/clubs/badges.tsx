import { AlertTriangle, Archive, CheckCircle, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import type { Club, ClubGroupKey } from "./types";

export function groupClubs(clubs: Club[], groupBy: ClubGroupKey) {
  if (groupBy === "none") return [{ key: "all", title: "Все клубы", clubs }];
  const groups = new Map<string, Club[]>();

  for (const club of clubs) {
    const key = groupBy === "visibility" ? (club.is_public ? "Публичные" : "Приватные") : club.status;
    groups.set(key, [...(groups.get(key) ?? []), club]);
  }

  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    title: groupBy === "visibility" ? key : `Статус: ${key}`,
    clubs: group,
  }));
}

export function ClubStatusBadge({ status }: Readonly<{ status: Club['status'] }>) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          На модерации
        </Badge>
      );
    case 'recruiting':
      return (
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
          <Users2 className="w-3 h-3 mr-1" />
          Набор участников
        </Badge>
      );
    case 'active':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Активный
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Завершен
        </Badge>
      );
    case 'archived':
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-500 border-gray-200">
          <Archive className="w-3 h-3 mr-1" />
          Архивирован
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
