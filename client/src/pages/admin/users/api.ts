import { apiRequest } from "@/lib/queryClient";

import type { ImpersonateResponse, TestPushResponse, User, UsersFilters, UsersResponse, UserSortKey, SortDirection } from "./types";

export async function fetchUsers(filters: UsersFilters): Promise<UsersResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.append("search", filters.search);
  if (filters.role && filters.role !== "all") params.append("role", filters.role);
  if (filters.status && filters.status !== "all") params.append("status", filters.status);
  params.append("sortBy", filters.sortBy);
  params.append("sortDirection", filters.sortDirection);
  params.append("page", filters.page.toString());
  params.append("limit", filters.limit.toString());

  return apiRequest<UsersResponse>(`/api/v1/admin/users?${params.toString()}`, {
    cache: "no-store",
  });
}

export async function updateUserRole(username: string, role: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${username}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function updateUserStatus(username: string, status: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${username}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function restoreUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/restore`, {
    method: "PUT",
  });
}

export async function permanentDeleteUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/permanent`, {
    method: "DELETE",
  });
}

export async function updateUserFields(userId: string, fields: { username?: string; email?: string }): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/fields`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}

export async function updateReaderLedPermission(userId: string, allowed: boolean): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/reader-led-permission`, {
    method: "PUT",
    body: JSON.stringify({ allowed }),
  });
}

export async function resetUserPassword(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
}


export async function sendTestPush(userId: string): Promise<TestPushResponse> {
  return apiRequest<TestPushResponse>(`/api/v1/admin/users/${userId}/test-push`, {
    method: "POST",
  });
}


export async function impersonateUser(userId: string): Promise<ImpersonateResponse> {
  return apiRequest<ImpersonateResponse>(`/api/v1/admin/users/${userId}/impersonate`, {
    method: "POST",
  });
}

export async function fetchDeletedUsers(sortBy: UserSortKey, sortDirection: SortDirection): Promise<UsersResponse> {
  const params = new URLSearchParams({ sortBy, sortDirection });
  const data = await apiRequest<{ users: User[] }>(`/api/v1/admin/users/deleted?${params.toString()}`);
  return {
    users: data.users,
    total: data.users.length,
    page: 1,
    limit: data.users.length,
  };
}
