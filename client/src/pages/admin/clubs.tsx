import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Archive, CheckCircle, Search, Users2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { modalAlert, modalConfirm } from "@/hooks/use-toast";

import { fetchClubMembers, fetchClubs, transferClubOwnership, updateClubMaxMembers } from "./clubs/api";
import { groupClubs } from "./clubs/badges";
import { ClubsTable, ClubsTableSkeleton } from "./clubs/clubs-table";
import type { Club, ClubGroupKey, ClubMember, ClubSortKey, ClubsFilters, ClubsResponse, SortDirection } from "./clubs/types";

export default function AdminClubs() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ClubsFilters>({
    search: '',
    status: 'all',
    page: 1,
    limit: 20,
    sortBy: 'created_at',
    sortDirection: 'desc',
    groupBy: 'none',
  });
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [newMaxMembers, setNewMaxMembers] = useState<number>(50);
  const [transferringClub, setTransferringClub] = useState<Club | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  const { data, isLoading, error } = useQuery<ClubsResponse>({
    queryKey: ['admin-clubs', filters],
    queryFn: () => fetchClubs(filters),
  });
  const groupedClubs = useMemo(() => groupClubs(data?.clubs ?? [], filters.groupBy), [data?.clubs, filters.groupBy]);

  const updateMaxMembersMutation = useMutation({
    mutationFn: ({ clubId, maxMembers }: { clubId: string; maxMembers: number }) =>
      updateClubMaxMembers(clubId, maxMembers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setEditingClub(null);
    },
  });

  const handleEditMaxMembers = (club: Club) => {
    setEditingClub(club);
    setNewMaxMembers(club.max_participants);
  };

  const handleTransferOwnership = (club: Club) => {
    setTransferringClub(club);
    setSelectedMemberId(null);
  };

  const { data: clubMembers } = useQuery<ClubMember[]>({
    queryKey: ['club-members', transferringClub?.id],
    queryFn: () => fetchClubMembers(transferringClub!.id),
    enabled: !!transferringClub,
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: ({ clubId, newOwnerId }: { clubId: string; newOwnerId: string }) =>
      transferClubOwnership(clubId, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setTransferringClub(null);
      setSelectedMemberId(null);
    },
    onError: (error) => {
      void modalAlert({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось передать права",
        variant: "destructive",
      });
    },
  });

  const handleConfirmTransfer = async () => {
    if (!transferringClub || !selectedMemberId) return;

    const selectedMember = clubMembers?.find(m => m.id === selectedMemberId);
    if (!selectedMember) return;

    const confirmed = await modalConfirm({
      title: "Передача прав владельца",
      description:
        `Вы уверены, что хотите передать права владельца клуба "${transferringClub.name}" пользователю ${selectedMember.username}?\n\n` +
        "Это действие нельзя отменить. Текущий владелец станет обычным участником.",
      confirmLabel: "Передать права",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsTransferring(true);
    try {
      await transferOwnershipMutation.mutateAsync({
        clubId: transferringClub.id,
        newOwnerId: selectedMemberId,
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleSaveMaxMembers = () => {
    if (editingClub) {
      updateMaxMembersMutation.mutate({ clubId: editingClub.id, maxMembers: newMaxMembers });
    }
  };

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleSortByChange = (sortBy: string) => {
    setFilters(prev => ({ ...prev, sortBy: sortBy as ClubSortKey, page: 1 }));
  };

  const handleSortDirectionChange = (sortDirection: string) => {
    setFilters(prev => ({ ...prev, sortDirection: sortDirection as SortDirection, page: 1 }));
  };

  const handleGroupByChange = (groupBy: string) => {
    setFilters(prev => ({ ...prev, groupBy: groupBy as ClubGroupKey, page: 1 }));
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить клубы</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage}</p>
            <Button className="mt-4" onClick={() => globalThis.location.reload()}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Управление клубами</h1>
            <p className="text-gray-600 mt-2">
              {data && `Найдено ${data.pagination.total} клубов`}
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего клубов</p>
                  <p className="text-2xl font-bold">{data?.pagination.total || 0}</p>
                </div>
                <Users2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Активные</p>
                  <p className="text-2xl font-bold text-green-600">
                    {data?.clubs.filter(c => c.status === 'active').length || 0}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">На модерации</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {data?.clubs.filter(c => c.status === 'pending').length || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Набирают участников</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {data?.clubs.filter(c => c.status === 'recruiting').length || 0}
                  </p>
                </div>
                <Users2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Завершенные</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {data?.clubs.filter(c => c.status === 'completed').length || 0}
                  </p>
                </div>
                <Archive className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск клубов..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={filters.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="pending">На модерации</SelectItem>
                  <SelectItem value="recruiting">Набор участников</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="completed">Завершенные</SelectItem>
                  <SelectItem value="archived">Архивированные</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Сортировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Дата создания</SelectItem>
                  <SelectItem value="name">Название клуба</SelectItem>
                  <SelectItem value="book_title">Книга</SelectItem>
                  <SelectItem value="creator">Создатель</SelectItem>
                  <SelectItem value="status">Статус</SelectItem>
                  <SelectItem value="participants">Участники</SelectItem>
                  <SelectItem value="max_participants">Лимит участников</SelectItem>
                  <SelectItem value="visibility">Публичность</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.sortDirection} onValueChange={handleSortDirectionChange}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Порядок" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">По убыванию</SelectItem>
                  <SelectItem value="asc">По возрастанию</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.groupBy} onValueChange={handleGroupByChange}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Группировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без группировки</SelectItem>
                  <SelectItem value="status">По статусу</SelectItem>
                  <SelectItem value="visibility">По публичности</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Clubs Table */}
        <Card>
          <CardContent className="p-0">
            {(() => {
              if (isLoading) {
                return <ClubsTableSkeleton />;
              }
              
              if (data && data.clubs.length > 0) {
                return (
                  <>
                    {groupedClubs.map((group) => (
                      <div key={group.key} className="border-b last:border-b-0">
                        {filters.groupBy !== "none" ? (
                          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                            {group.title} · {group.clubs.length}
                          </div>
                        ) : null}
                        <ClubsTable 
                          clubs={group.clubs} 
                          onEditMaxMembers={handleEditMaxMembers}
                          onTransferOwnership={handleTransferOwnership}
                        />
                      </div>
                    ))}
                  </>
                );
              }
              
              return (
                <div className="text-center py-12">
                  <Users2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">Клубы не найдены</h3>
                  <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.pagination.total > filters.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Показано {Math.min(filters.limit, data.pagination.total)} из {data.pagination.total} клубов
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Предыдущая
              </Button>
              <span className="text-sm text-gray-600">
                Страница {filters.page} из {Math.ceil(data.pagination.total / filters.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= Math.ceil(data.pagination.total / filters.limit)}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Следующая
              </Button>
            </div>
          </div>
        )}

        {/* Modal for editing max members */}
        <Dialog open={!!editingClub} onOpenChange={(open) => !open && setEditingClub(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Изменить лимит участников</DialogTitle>
              <DialogDescription>
                Клуб: {editingClub?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="maxMembers">Максимальное количество участников</Label>
                <Input
                  id="maxMembers"
                  type="number"
                  min={2}
                  max={2000}
                  value={newMaxMembers}
                  onChange={(e) => setNewMaxMembers(Number.parseInt(e.target.value) || 2)}
                />
                <p className="text-sm text-muted-foreground">
                  Текущее количество участников: {editingClub?.current_participants || 0}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingClub(null)}>
                Отмена
              </Button>
              <Button 
                onClick={handleSaveMaxMembers}
                disabled={updateMaxMembersMutation.isPending}
              >
                {updateMaxMembersMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal for transferring ownership */}
        <Dialog open={!!transferringClub} onOpenChange={(open) => !open && setTransferringClub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Передать права владельца</DialogTitle>
              <DialogDescription>
                Клуб: {transferringClub?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Предупреждение */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Внимание!</p>
                    <p className="mt-1">
                      После передачи прав текущий владелец станет обычным участником клуба.
                      Это действие нельзя отменить.
                    </p>
                  </div>
                </div>
              </div>

              {/* Список участников */}
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Выберите нового владельца:
                </span>
                {(() => {
                  if (!clubMembers) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        Загрузка участников...
                      </div>
                    );
                  }

                  const eligibleMembers = clubMembers.filter(m => m.role !== 'owner');
                  if (eligibleMembers.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        В клубе нет других участников для передачи прав
                      </div>
                    );
                  }

                  return (
                    <ScrollArea className="h-[300px] border rounded-lg">
                      <div className="p-2 space-y-2">
                        {eligibleMembers.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => setSelectedMemberId(member.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                              selectedMemberId === member.id
                                ? 'bg-primary/10 border-2 border-primary'
                                : 'hover:bg-muted border-2 border-transparent'
                            }`}
                          >
                            <Avatar className="h-10 w-10">
                              {member.avatar && <AvatarImage src={member.avatar} alt={member.username} />}
                              <AvatarFallback>
                                {member.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <p className="font-medium">{member.username}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {member.role === 'moderator' ? 'Модератор' : 'Участник'}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  );
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferringClub(null)}>
                Отмена
              </Button>
              <Button 
                onClick={handleConfirmTransfer}
                disabled={!selectedMemberId || isTransferring}
              >
                {isTransferring ? 'Передача...' : 'Передать права'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
