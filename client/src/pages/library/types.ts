import type { PersonalBook } from "@/hooks/use-books-v2";

export interface ReadingStatusRecord {
  id: string;
  bookId: string;
  bookType: "personal" | "club";
  status: "reading" | "completed" | "planned" | "abandoned";
  notes: string | null;
  completedAt?: string | null;
  updatedAt?: string;
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string | null;
    format?: string;
  } | null;
}

export interface PersonalLibraryBookCardProps {
  book: PersonalBook;
  fallbackCover: string;
  formatBookGenres: (book: PersonalBook) => string;
  onRead: (book: PersonalBook) => void;
  onEdit: (book: PersonalBook) => void;
  onDelete: (book: PersonalBook) => void;
  onMarkAsCompleted: (book: PersonalBook) => void;
  onPlan: (book: PersonalBook) => void;
  onRecommend: (book: PersonalBook) => void;
  onNotInterested: (book: PersonalBook) => void;
  canMarkAsCompleted: boolean;
  markAsCompletedPending: boolean;
}

export type ShelfSort = "completed_desc" | "completed_asc" | "title_asc" | "title_desc";
export type ShelfFormatFilter = "all" | "EPUB" | "FB2";
export type LibrarySort = "created_desc" | "created_asc" | "title_asc" | "title_desc" | "author_asc" | "author_desc" | "genre_asc";
export type GenreGroupMode = "none" | "primary_genre";

export type RecommendationPayload = {
  type: "book";
  entityId: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  comment?: string | null;
};

export type DmConversationCreateResponse = {
  conversation: {
    id: string;
  };
};
