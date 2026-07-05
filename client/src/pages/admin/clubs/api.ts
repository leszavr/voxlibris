import { apiRequest } from "@/lib/queryClient";

import type { ClubMember, ClubsFilters, ClubsResponse } from "./types";

export async function fetchClubs(filters: ClubsFilters): Promise<ClubsResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  params.append('sortBy', filters.sortBy);
  params.append('sortDirection', filters.sortDirection);
  params.append('groupBy', filters.groupBy);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  return apiRequest<ClubsResponse>(`/api/v1/admin/clubs?${params.toString()}`);
}

export async function deleteClub(clubId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}`, {
    method: 'DELETE',
  });
}

export async function updateClubStatus(clubId: string, status: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function updateClubMaxMembers(clubId: string, maxMembers: number): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}`, {
    method: 'PUT',
    body: JSON.stringify({ maxMembers }),
  });
}

export async function approveClub(clubId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/approve`, {
    method: 'PUT',
  });
}

export async function rejectClub(clubId: string, reason: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/reject`, {
    method: 'PUT',
    body: JSON.stringify({ reason }),
  });
}

export async function updateClubPrivacy(clubId: string, isPublic: boolean): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/privacy`, {
    method: 'PUT',
    body: JSON.stringify({ isPublic }),
  });
}

export async function fetchClubMembers(clubId: string): Promise<ClubMember[]> {
  return apiRequest<ClubMember[]>(`/api/clubs/${clubId}/members`);
}

export async function transferClubOwnership(clubId: string, newOwnerId: string): Promise<void> {
  await apiRequest(`/api/clubs/${clubId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ newOwnerId }),
  });
}
