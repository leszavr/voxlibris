import { apiRequest } from "@/lib/queryClient";

import type { BooksFilters, BooksResponse, GuestBooksResponse } from "./types";

export async function fetchBooks(filters: BooksFilters): Promise<BooksResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters.genre && filters.genre !== 'all') params.append('genre', filters.genre);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  return apiRequest<BooksResponse>(`/api/v1/admin/books?${params.toString()}`);
}

export async function fetchGuestBooks(params: { search: string; status: string; page: number; limit: number }): Promise<GuestBooksResponse> {
  const query = new URLSearchParams();
  query.append("limit", params.limit.toString());
  query.append("page", params.page.toString());

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.status && params.status !== "all") {
    query.append("status", params.status);
  }

  return apiRequest<GuestBooksResponse>(`/api/v1/admin/guest-books?${query.toString()}`);
}

export async function updateGuestBookStatus(bookId: string, status: "approved" | "rejected", notes?: string): Promise<void> {
  await apiRequest(`/api/v1/admin/guest-books/${bookId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, notes }),
  });
}

export async function deleteGuestBookAdmin(bookId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/guest-books/${bookId}`, {
    method: "DELETE",
  });
}

export async function deleteBook(bookId: string, source: string): Promise<void> {
  await apiRequest(`/api/v1/admin/books/${bookId}?source=${source}`, {
    method: 'DELETE',
  });
}

export async function updateBookStatus(bookId: string, status: string, source: string, reason?: string): Promise<void> {
  await apiRequest(`/api/v1/admin/books/${bookId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, source, reason }),
  });
}
