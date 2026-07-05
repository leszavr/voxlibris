import { ArrowUpDown, Download, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import type { AnalyticsStats, ClubSortKey } from "./types";

interface AnalyticsListsProps {
  stats: AnalyticsStats;
  sortedClubStats: AnalyticsStats['clubStats'];
  isExportingTopBooks: boolean;
  isExportingTopUsers: boolean;
  exportTopBooksCsv: () => void;
  exportTopUsersCsv: () => void;
  exportClubStatsCsv: () => void;
  toggleClubSort: (key: ClubSortKey) => void;
  openBookDetails: (book: AnalyticsStats['topBooks'][number]) => void;
  openUserDetails: (user: AnalyticsStats['topUsers'][number]) => void;
  openClubDetails: (club: AnalyticsStats['clubStats'][number]) => void;
}

export function AnalyticsLists({
  stats,
  sortedClubStats,
  isExportingTopBooks,
  isExportingTopUsers,
  exportTopBooksCsv,
  exportTopUsersCsv,
  exportClubStatsCsv,
  toggleClubSort,
  openBookDetails,
  openUserDetails,
  openClubDetails,
}: AnalyticsListsProps) {
  return (
    <>
      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Топ-10 популярных книг</CardTitle>
              <CardDescription>По количеству событий (кликните для деталей)</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportTopBooksCsv}
              disabled={!stats.topBooks.length || isExportingTopBooks}
            >
              {isExportingTopBooks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExportingTopBooks ? 'Формируем CSV...' : 'Скачать CSV'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topBooks.map((book, index) => (
                <button
                  key={book.bookId}
                  className="flex items-center p-2 rounded-lg hover:bg-muted/50 transition-colors text-left w-full"
                  onClick={() => openBookDetails(book)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-primary">{book.title}</div>
                    {book.author && <div className="text-sm text-muted-foreground truncate">{book.author}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      #{index + 1} • {book.events} событий
                    </div>
                  </div>
                </button>
              ))}
              {stats.topBooks.length === 0 && (
                <div className="text-center text-muted-foreground py-8">Нет данных за выбранный период</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Топ-10 активных пользователей</CardTitle>
              <CardDescription>По количеству событий</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={exportTopUsersCsv}
              disabled={!stats.topUsers.length || isExportingTopUsers}
            >
              {isExportingTopUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExportingTopUsers ? 'Формируем CSV...' : 'Скачать CSV'}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topUsers.map((user, index) => (
                <button
                  key={user.userId}
                  className="flex items-center p-2 rounded-lg hover:bg-muted/50 transition-colors text-left w-full"
                  onClick={() => openUserDetails(user)}
                >
                  <div className="font-bold text-muted-foreground mr-4 w-6">#{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-primary">{user.username}</div>
                  </div>
                  <div className="text-sm font-medium ml-4">{user.events} событий</div>
                </button>
              ))}
              {stats.topUsers.length === 0 && (
                <div className="text-center text-muted-foreground py-8">Нет данных за выбранный период</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Клубная аналитика</CardTitle>
            <CardDescription>
              События по клубам (вступления, выходы, сессии чтения). Кликните по строке для детализации.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={exportClubStatsCsv} disabled={!sortedClubStats.length}>
            <Download className="h-4 w-4" />
            Скачать CSV
          </Button>
        </CardHeader>
        <CardContent>
          {sortedClubStats.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Нет клубной активности за выбранный период</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клуб</TableHead>
                  <SortableHead label="События" sortKey="totalEvents" onSort={toggleClubSort} />
                  <TableHead>Вступления</TableHead>
                  <TableHead>Выходы</TableHead>
                  <SortableHead label="Сессии" sortKey="totalSessions" onSort={toggleClubSort} />
                  <SortableHead label="Активные участники" sortKey="activeMembers" onSort={toggleClubSort} />
                  <SortableHead label="Последняя активность" sortKey="lastActivityAt" onSort={toggleClubSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClubStats.map((club) => (
                  <TableRow key={club.clubId} className="cursor-pointer" onClick={() => openClubDetails(club)}>
                    <TableCell className="font-medium text-primary">{club.clubTitle}</TableCell>
                    <TableCell className="tabular-nums">{club.totalEvents.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">{club.joinEvents.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">{club.leaveEvents.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">{club.totalSessions.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">{club.activeMembers.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {club.lastActivityAt ? new Date(club.lastActivityAt).toLocaleString('ru-RU') : 'Нет активности'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SortableHead({ label, sortKey, onSort }: { label: string; sortKey: ClubSortKey; onSort: (key: ClubSortKey) => void }) {
  return (
    <TableHead>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(sortKey)}>
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}
