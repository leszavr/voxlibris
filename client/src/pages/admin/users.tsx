import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search, Trash2, User as UserIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { deleteUser, fetchDeletedUsers, fetchUsers, permanentDeleteUser } from "./users/api";
import { groupUsers } from "./users/badges";
import type { SortDirection, User, UserGroupKey, UserSortKey, UsersFilters, UsersResponse } from "./users/types";
import { UsersTable, UsersTableSkeleton } from "./users/users-table";

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState("active");
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<UsersFilters>({
    search: "",
    role: "all",
    status: "all",
    page: 1,
    limit: 20,
    sortBy: "created_at",
    sortDirection: "desc",
  });
  const [groupBy, setGroupBy] = useState<UserGroupKey>("none");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ["admin-users", filters],
    queryFn: () => fetchUsers(filters),
    enabled: activeTab === "active",
  });

  const {
    data: deletedData,
    isLoading: deletedLoading,
    error: deletedError,
  } = useQuery<UsersResponse>({
    queryKey: ["admin-deleted-users", filters.sortBy, filters.sortDirection],
    queryFn: () => fetchDeletedUsers(filters.sortBy, filters.sortDirection),
    enabled: activeTab === "deleted",
  });

  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  };

  const handleRoleChange = (role: string) => {
    setFilters((prev) => ({ ...prev, role, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const currentData = activeTab === "deleted" ? deletedData : data;
  const currentLoading = activeTab === "deleted" ? deletedLoading : isLoading;
  const currentError = activeTab === "deleted" ? deletedError : error;
  const groupedUsers = useMemo(() => groupUsers(currentData?.users ?? [], groupBy), [currentData?.users, groupBy]);
  const selectedUsersCount = selectedIds.size;

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (activeTab === "deleted") {
        await Promise.all(ids.map(permanentDeleteUser));
      } else {
        await Promise.all(ids.map(deleteUser));
      }
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
    },
  });

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = (usersToToggle: User[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = usersToToggle.every((user) => next.has(user.id));
      for (const user of usersToToggle) {
        if (allSelected) next.delete(user.id); else next.add(user.id);
      }
      return next;
    });
  };

  const renderUsersTable = () => {
    if (currentLoading) {
      return <UsersTableSkeleton />;
    }
    if (currentData && currentData.users.length > 0) {
      return groupedUsers.map((group) => (
        <div key={group.key} className="border-b last:border-b-0">
          {groupBy !== "none" ? <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{group.title} · {group.users.length}</div> : null}
          <UsersTable users={group.users} selectedIds={selectedIds} onToggleUser={toggleUser} onToggleAll={toggleAll} />
        </div>
      ));
    }
    return (
      <div className="text-center py-12">
        <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Пользователи не найдены</h3>
        <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
      </div>
    );
  };

  const renderDeletedTabContent = () => {
    if (currentLoading) {
      return <UsersTableSkeleton />;
    }
    if (currentData && currentData.users.length > 0) {
      return (
        <>
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-semibold">Удаленные пользователи</p>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Эти пользователи помечены как удаленные. Вы можете восстановить их или удалить
              окончательно.
            </p>
          </div>
          {groupedUsers.map((group) => (
            <div key={group.key} className="border-b last:border-b-0">
              {groupBy !== "none" ? <div className="bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{group.title} · {group.users.length}</div> : null}
              <UsersTable users={group.users} selectedIds={selectedIds} onToggleUser={toggleUser} onToggleAll={toggleAll} />
            </div>
          ))}
        </>
      );
    }
    return (
      <div className="text-center py-12">
        <Trash2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Нет удаленных пользователей</h3>
        <p className="text-gray-600 mt-2">Все удаленные пользователи будут отображаться здесь</p>
      </div>
    );
  };

  if (currentError) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить пользователей</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Управление пользователями</h1>
            <p className="text-gray-600 mt-2">
              {currentData ? `Найдено ${currentData.total} пользователей` : "Загрузка..."}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setSelectedIds(new Set()); }}>
          <TabsList>
            <TabsTrigger value="active">Активные пользователи</TabsTrigger>
            <TabsTrigger value="deleted" className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Удаленные
            </TabsTrigger>
          </TabsList>

          <Card className="mt-6">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-3">
                <Select value={filters.sortBy} onValueChange={(value) => setFilters((prev) => ({ ...prev, sortBy: value as UserSortKey, page: 1 }))}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Сортировка" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Дата регистрации</SelectItem>
                    <SelectItem value="last_active">Последняя активность</SelectItem>
                    <SelectItem value="username">Username</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="role">Роль</SelectItem>
                    <SelectItem value="status">Статус</SelectItem>
                    <SelectItem value="books_read">Книг прочитано</SelectItem>
                    <SelectItem value="clubs_created">Клубов создано</SelectItem>
                    <SelectItem value="clubs_joined">Участие в клубах</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.sortDirection} onValueChange={(value) => setFilters((prev) => ({ ...prev, sortDirection: value as SortDirection, page: 1 }))}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Порядок" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">По убыванию</SelectItem>
                    <SelectItem value="asc">По возрастанию</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={groupBy} onValueChange={(value) => setGroupBy(value as UserGroupKey)}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Группировка" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без группировки</SelectItem>
                    <SelectItem value="role">По роли</SelectItem>
                    <SelectItem value="status">По статусу</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleAll(currentData?.users ?? [])} disabled={!currentData?.users.length}>Выбрать всех на странице</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())} disabled={selectedUsersCount === 0}>Снять выбор</Button>
                <Button variant="destructive" size="sm" onClick={() => bulkDeleteMutation.mutate()} disabled={selectedUsersCount === 0 || bulkDeleteMutation.isPending}>
                  {bulkDeleteMutation.isPending ? "Удаление..." : activeTab === "deleted" ? `Удалить окончательно (${selectedUsersCount})` : `Удалить выбранных (${selectedUsersCount})`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <TabsContent value="active" className="space-y-4 mt-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Поиск пользователей..."
                        value={filters.search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Select value={filters.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Роль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все роли</SelectItem>
                      <SelectItem value="user">Пользователи</SelectItem>
                      <SelectItem value="moderator">Модераторы</SelectItem>
                      <SelectItem value="admin">Администраторы</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      <SelectItem value="active">Активные</SelectItem>
                      <SelectItem value="pending">Ожидают</SelectItem>
                      <SelectItem value="suspended">Заблокированные</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Users Table */}
            <Card>
              <CardContent className="p-0">{renderUsersTable()}</CardContent>
            </Card>

            {/* Pagination */}
            {currentData && currentData.total > filters.limit && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Показано {Math.min(filters.limit, currentData.total)} из {currentData.total}{" "}
                  пользователей
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
                    Страница {filters.page} из {Math.ceil(currentData.total / filters.limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={filters.page >= Math.ceil(currentData.total / filters.limit)}
                    onClick={() => handlePageChange(filters.page + 1)}
                  >
                    Следующая
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="deleted" className="space-y-4 mt-6">
            <Card>
              <CardContent className="p-0">{renderDeletedTabContent()}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
