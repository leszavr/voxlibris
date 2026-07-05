export interface Club {
  id: string;
  name: string;
  description: string | null;
  book_id: string;
  book_title: string;
  book_author: string;
  creator_username: string;
  status: 'pending' | 'recruiting' | 'active' | 'completed' | 'archived';
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  max_participants: number;
  current_participants: number;
  reading_schedule: unknown;
  is_public: boolean;
}

export interface ClubsResponse {
  clubs: Club[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ClubsFilters {
  search: string;
  status: string;
  page: number;
  limit: number;
  sortBy: ClubSortKey;
  sortDirection: SortDirection;
  groupBy: ClubGroupKey;
}

export type ClubSortKey = "created_at" | "name" | "book_title" | "creator" | "status" | "participants" | "max_participants" | "visibility";
export type SortDirection = "asc" | "desc";
export type ClubGroupKey = "none" | "status" | "visibility";

export interface ClubMember {
  id: string;
  username: string;
  avatar?: string | null;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: Date;
  status: string;
  emailConfirmed: boolean;
  createdAt: Date;
}
