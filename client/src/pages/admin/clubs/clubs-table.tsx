import { Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { ClubActionsMenu } from "./actions-menu";
import { ClubStatusBadge } from "./badges";
import type { Club } from "./types";

export function ClubsTable({ 
  clubs, 
  onEditMaxMembers, 
  onTransferOwnership 
}: Readonly<{ 
  clubs: Club[]; 
  onEditMaxMembers: (club: Club) => void;
  onTransferOwnership: (club: Club) => void;
}>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Клуб</th>
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Участники</th>
            <th className="text-left p-4 font-medium text-gray-600">Даты</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr key={club.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{club.name}</div>
                  <div className="text-sm text-gray-500 max-w-xs truncate">
                    {club.description}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <User className="w-3 h-3" />
                      {club.creator_username}
                    </div>
                    {club.is_public ? (
                      <Badge variant="outline" className="text-xs">
                        Публичный
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Приватный
                      </Badge>
                    )}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{club.book_title}</div>
                  <div className="text-sm text-gray-500">{club.book_author}</div>
                </div>
              </td>
              <td className="p-4">
                <ClubStatusBadge status={club.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div className="font-medium">
                    {club.current_participants} / {club.max_participants}
                  </div>
                  <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ 
                        width: `${Math.min((club.current_participants / club.max_participants) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-3 h-3" />
                    Создан: {new Date(club.created_at).toLocaleDateString('ru')}
                  </div>
                  {club.start_date && (
                    <div className="text-gray-500">
                      Старт: {new Date(club.start_date).toLocaleDateString('ru')}
                    </div>
                  )}
                  {club.end_date && (
                    <div className="text-gray-500">
                      Конец: {new Date(club.end_date).toLocaleDateString('ru')}
                    </div>
                  )}
                </div>
              </td>
              <td className="p-4 text-right">
                <ClubActionsMenu 
                  club={club} 
                  onEditMaxMembers={onEditMaxMembers}
                  onTransferOwnership={onTransferOwnership}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClubsTableSkeleton() {
  const skeletonKeys = ['club-sk-1', 'club-sk-2', 'club-sk-3', 'club-sk-4', 'club-sk-5'];
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Клуб</th>
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Участники</th>
            <th className="text-left p-4 font-medium text-gray-600">Даты</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {skeletonKeys.map((key) => (
            <tr key={key} className="border-b">
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-24" />
              </td>
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-2 w-20" />
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-24" />
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
