export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: "user" | "moderator" | "admin";
  status: "active" | "pending" | "suspended" | "deleted";
  created_at: string | null;
  last_active: string | null;
  books_read: number;
  clubs_joined: number;
  clubs_created: number;
  can_create_reader_led_clubs: boolean;
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export interface UsersFilters {
  search: string;
  role: string;
  status: string;
  page: number;
  limit: number;
  sortBy: UserSortKey;
  sortDirection: SortDirection;
}

export type UserSortKey = "created_at" | "last_active" | "username" | "email" | "role" | "status" | "books_read" | "clubs_created" | "clubs_joined";
export type SortDirection = "asc" | "desc";
export type UserGroupKey = "none" | "role" | "status";

export interface TestPushResponse {
  success: boolean;
  sent: number;
  skipped: boolean;
  reason?: string;
  message: string;
}


export interface ImpersonateResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    status: string;
  };
}
