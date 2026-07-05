export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  genre: string | null;
  cover_url: string | null;
  file_url: string;
  status: 'active' | 'blocked' | 'pending';
  uploaded_by: string;
  upload_date: string;
  file_size: number;
  downloads_count: number;
  clubs_count: number;
  description: string | null;
  source: 'books' | 'personal_books' | 'club_books';
  club_id: string | null;
}

export interface BooksResponse {
  books: Book[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface BooksFilters {
  search: string;
  status: string;
  genre: string;
  page: number;
  limit: number;
}

export interface GuestBook {
  id: string;
  guestAccountId: string;
  guestAccessCode: string;
  title: string;
  author: string;
  format: "epub" | "fb2";
  wordCount: number | null;
  uploadedAt: string;
  moderationStatus: "pending" | "approved" | "rejected";
  moderationNotes: string | null;
}

export interface GuestBooksResponse {
  books: GuestBook[];
  pagination: {
    page: number;
    limit: number;
    offset: number;
    total: number;
    pages: number;
  };
}
