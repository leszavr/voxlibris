import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PersonalBook } from "@/hooks/use-books-v2";
import type { ReadingStatusRecord } from "./types";

interface EditFormState {
  title: string;
  author: string;
  description: string;
  genre: string;
}

interface LibraryDialogsProps {
  editingBook: PersonalBook | null;
  setEditingBook: (book: PersonalBook | null) => void;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  handleUpdateBook: () => void;
  updateBookPending: boolean;
  deletingBook: PersonalBook | null;
  setDeletingBook: (book: PersonalBook | null) => void;
  handleDeleteBook: () => void;
  deleteBookPending: boolean;
  planningBook: PersonalBook | null;
  setPlanningBook: (book: PersonalBook | null) => void;
  plannedYear: number;
  setPlannedYear: (year: number) => void;
  futureYears: number[];
  handleConfirmPlanBook: () => void;
  planBookPending: boolean;
  recommendBook: PersonalBook | null;
  setRecommendBook: (book: PersonalBook | null) => void;
  recommendComment: string;
  setRecommendComment: (comment: string) => void;
  allTargetsSelected: boolean;
  handleToggleSelectAllTargets: (checked: boolean) => void;
  recommendSelectedUserIds: Set<string>;
  renderRecommendTargetsList: () => React.ReactNode;
  handleSendBookRecommendation: () => void;
  recommendSending: boolean;
  recommendLoading: boolean;
  shelfDeleteItem: ReadingStatusRecord | null;
  shelfDeleteCode: string;
  shelfDeleteInput: string;
  setShelfDeleteInput: (value: string) => void;
  handleCloseShelfDelete: () => void;
  handleConfirmShelfDelete: () => void;
  removeFromShelfPending: boolean;
  notInterestedBook: PersonalBook | null;
  setNotInterestedBook: (book: PersonalBook | null) => void;
  handleConfirmNotInterested: () => void;
  markAsNotInterestedPending: boolean;
}

export function LibraryDialogs(props: LibraryDialogsProps) {
  return (
    <>
      <Dialog open={!!props.editingBook} onOpenChange={() => props.setEditingBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Редактировать книгу</DialogTitle>
            <DialogDescription>Измените информацию о книге. Нажмите "Сохранить" для применения изменений.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <EditInput id="title" label="Название" value={props.editForm.title} onChange={(title) => props.setEditForm((prev) => ({ ...prev, title }))} />
            <EditInput id="author" label="Автор" value={props.editForm.author} onChange={(author) => props.setEditForm((prev) => ({ ...prev, author }))} />
            <div className="grid gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
              <Label htmlFor="description" className="sm:text-right">Описание</Label>
              <Textarea id="description" value={props.editForm.description} onChange={(e) => props.setEditForm((prev) => ({ ...prev, description: e.target.value }))} className="sm:col-span-3" />
            </div>
            <EditInput id="genre" label="Жанр" value={props.editForm.genre} onChange={(genre) => props.setEditForm((prev) => ({ ...prev, genre }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setEditingBook(null)}>Отмена</Button>
            <Button onClick={props.handleUpdateBook} disabled={props.updateBookPending}>{props.updateBookPending ? "Сохранение..." : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!props.deletingBook} onOpenChange={() => props.setDeletingBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удалить книгу</DialogTitle>
            <DialogDescription>Вы уверены, что хотите удалить книгу "{props.deletingBook?.title}"? Это действие нельзя отменить. Все данные о книге и её содержимое будут удалены.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setDeletingBook(null)}>Отмена</Button>
            <Button variant="destructive" onClick={props.handleDeleteBook} disabled={props.deleteBookPending}>{props.deleteBookPending ? "Удаление..." : "Удалить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!props.planningBook} onOpenChange={() => props.setPlanningBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Запланировать чтение</DialogTitle>
            <DialogDescription>Выберите будущий год, в котором хотите прочитать книгу "{props.planningBook?.title}".</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="planned-year">Хочу прочитать в году</Label>
            <Select value={String(props.plannedYear)} onValueChange={(value) => props.setPlannedYear(Number.parseInt(value, 10))}>
              <SelectTrigger id="planned-year"><SelectValue placeholder="Выберите год" /></SelectTrigger>
              <SelectContent>{props.futureYears.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setPlanningBook(null)}>Отмена</Button>
            <Button onClick={props.handleConfirmPlanBook} disabled={props.planBookPending}>{props.planBookPending ? "Сохраняем..." : "Запланировать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!props.recommendBook} onOpenChange={() => props.setRecommendBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Порекомендовать книгу</DialogTitle>
            <DialogDescription>Выберите подписчиков и/или пользователей, на которых вы подписаны. Отправятся только метаданные книги и ваш комментарий.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{props.recommendBook?.title}</p>
              <p className="text-muted-foreground">{props.recommendBook?.author}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommend-comment">Комментарий</Label>
              <Textarea id="recommend-comment" placeholder="Почему рекомендуете эту книгу?" maxLength={500} value={props.recommendComment} onChange={(e) => props.setRecommendComment(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="recommend-select-all" checked={props.allTargetsSelected} onCheckedChange={(checked) => props.handleToggleSelectAllTargets(checked === true)} />
                <Label htmlFor="recommend-select-all">Выбрать всех</Label>
              </div>
              <span className="text-xs text-muted-foreground">Выбрано: {props.recommendSelectedUserIds.size}</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">{props.renderRecommendTargetsList()}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setRecommendBook(null)}>Отмена</Button>
            <Button onClick={props.handleSendBookRecommendation} disabled={props.recommendSending || props.recommendLoading}>{props.recommendSending ? "Отправляем..." : "Отправить рекомендацию"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!props.shelfDeleteItem} onOpenChange={(open) => !open && props.handleCloseShelfDelete()}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удалить книгу с полки</DialogTitle>
            <DialogDescription>Чтобы избежать случайного удаления, введите код подтверждения для книги "{props.shelfDeleteItem?.book?.title}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Код подтверждения</p>
              <p className="mt-1 font-mono text-lg tracking-widest">{props.shelfDeleteCode || "------"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shelf-delete-code">Введите код</Label>
              <Input id="shelf-delete-code" inputMode="numeric" maxLength={6} value={props.shelfDeleteInput} onChange={(e) => props.setShelfDeleteInput(e.target.value.replaceAll(/\D/g, "").slice(0, 6))} placeholder="6 цифр" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={props.handleCloseShelfDelete}>Отмена</Button>
            <Button variant="destructive" onClick={props.handleConfirmShelfDelete} disabled={props.removeFromShelfPending || props.shelfDeleteInput.length !== 6}>{props.removeFromShelfPending ? "Удаляем..." : "Удалить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!props.notInterestedBook} onOpenChange={() => props.setNotInterestedBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Не интересно</DialogTitle>
            <DialogDescription>Книга "{props.notInterestedBook?.title}" будет удалена из личной библиотеки и сохранена в разделе "Брошено" для статистики.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setNotInterestedBook(null)}>Отмена</Button>
            <Button variant="destructive" onClick={props.handleConfirmNotInterested} disabled={props.markAsNotInterestedPending}>{props.markAsNotInterestedPending ? "Удаляем..." : "Подтвердить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
      <Label htmlFor={id} className="sm:text-right">{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="sm:col-span-3" />
    </div>
  );
}
