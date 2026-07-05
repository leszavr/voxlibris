import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { EMPTY_REWARD_ASSET_FORM, OPERATOR_HELP, OPERATOR_OPTIONS_BY_VALUE_TYPE } from "./constants";
import type { BuildingBlockFormState, FieldRegistryItem, IconType, RewardAssetFormState, RewardAssetItem, ValueType } from "./types";

interface BlockDialogProps {
  open: boolean;
  reset: () => void;
  setOpen: (open: boolean) => void;
  editingBlock: unknown;
  blockForm: BuildingBlockFormState;
  setBlockForm: Dispatch<SetStateAction<BuildingBlockFormState>>;
  blockFieldPopoverOpen: boolean;
  setBlockFieldPopoverOpen: (open: boolean) => void;
  fieldRegistryLoading: boolean;
  fieldRegistryError: boolean;
  fieldRegistryGroups: Record<string, FieldRegistryItem[]>;
  selectedBlockField: FieldRegistryItem | null;
  applyFieldSelection: (fieldKey: string) => void;
  onSave: () => void;
  savePending: boolean;
}

export function BlockDialog({
  open,
  reset,
  setOpen,
  editingBlock,
  blockForm,
  setBlockForm,
  blockFieldPopoverOpen,
  setBlockFieldPopoverOpen,
  fieldRegistryLoading,
  fieldRegistryError,
  fieldRegistryGroups,
  selectedBlockField,
  applyFieldSelection,
  onSave,
  savePending,
}: Readonly<BlockDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : reset())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingBlock ? "Редактирование параметра условия" : "Новый параметр условия"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <TextInput id="block-label" label="Название" value={blockForm.labelRu} onChange={(value) => setBlockForm((prev) => ({ ...prev, labelRu: value }))} />
          <FieldRegistryPicker
            open={blockFieldPopoverOpen}
            setOpen={setBlockFieldPopoverOpen}
            loading={fieldRegistryLoading}
            error={fieldRegistryError}
            groups={fieldRegistryGroups}
            selectedField={selectedBlockField}
            applyFieldSelection={applyFieldSelection}
          />
          <TextInput id="block-code" label="Код" value={blockForm.code} onChange={(value) => setBlockForm((prev) => ({ ...prev, code: value }))} />
          <p className="text-xs text-muted-foreground">Можно скорректировать вручную, если нужен пользовательский код.</p>
          <BlockValueTypeSelect blockForm={blockForm} setBlockForm={setBlockForm} />
          <BlockOperators blockForm={blockForm} setBlockForm={setBlockForm} />
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input id="block-active" type="checkbox" checked={blockForm.isActive} onChange={(event) => setBlockForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            <Label htmlFor="block-active" className="cursor-pointer">Параметр активен</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={reset}>Отмена</Button>
          <Button onClick={onSave} disabled={savePending}>{savePending ? "Сохраняем..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextInput({ id, label, value, onChange }: Readonly<{ id: string; label: string; value: string; onChange: (value: string) => void }>) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function FieldRegistryPicker({ open, setOpen, loading, error, groups, selectedField, applyFieldSelection }: Readonly<{ open: boolean; setOpen: (open: boolean) => void; loading: boolean; error: boolean; groups: Record<string, FieldRegistryItem[]>; selectedField: FieldRegistryItem | null; applyFieldSelection: (fieldKey: string) => void }>) {
  return <div className="space-y-2"><Label>Источник поля из БД</Label><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between" disabled={loading}><span className="truncate text-left">{selectedField ? `${selectedField.group} · ${selectedField.label}` : "Выберите поле из реестра"}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" portalled={false}><Command><CommandInput placeholder="Поиск поля..." /><CommandList><CommandEmpty>{error ? "Не удалось загрузить реестр полей" : "Поля не найдены"}</CommandEmpty>{Object.entries(groups).map(([group, fields]) => <CommandGroup key={group} heading={group}>{fields.map((field) => <CommandItem key={field.key} value={`${field.label} ${field.key}`} onSelect={() => { applyFieldSelection(field.key); setOpen(false); }}><div className="flex flex-col"><span>{field.label}</span><span className="text-xs text-muted-foreground">{field.key}</span></div></CommandItem>)}</CommandGroup>)}</CommandList></Command></PopoverContent></Popover><p className="text-xs text-muted-foreground">Поле, код и тип значения подставляются автоматически из реестра БД.</p></div>;
}

function BlockValueTypeSelect({ blockForm, setBlockForm }: Readonly<{ blockForm: BuildingBlockFormState; setBlockForm: Dispatch<SetStateAction<BuildingBlockFormState>> }>) {
  return <div className="space-y-2"><Label htmlFor="block-value-type">Тип значения</Label><Select value={blockForm.valueType} onValueChange={(value: ValueType) => setBlockForm((prev) => { const allowed = new Set(OPERATOR_OPTIONS_BY_VALUE_TYPE[value]); const preserved = prev.supportedOperators.filter((operator) => allowed.has(operator)); return { ...prev, valueType: value, supportedOperators: preserved.length > 0 ? preserved : [...OPERATOR_OPTIONS_BY_VALUE_TYPE[value]] }; })}><SelectTrigger id="block-value-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="number">Число</SelectItem><SelectItem value="string">Строка</SelectItem><SelectItem value="boolean">Да/нет</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">При выборе поля из БД тип подставляется автоматически.</p></div>;
}

function BlockOperators({ blockForm, setBlockForm }: Readonly<{ blockForm: BuildingBlockFormState; setBlockForm: Dispatch<SetStateAction<BuildingBlockFormState>> }>) {
  return <div className="space-y-2"><Label>Операторы</Label><div className="grid grid-cols-2 gap-2 rounded-lg border p-3">{OPERATOR_OPTIONS_BY_VALUE_TYPE[blockForm.valueType].map((operator) => <label key={operator} className="flex items-center gap-2 text-sm" title={OPERATOR_HELP[operator] ?? operator}><input type="checkbox" checked={blockForm.supportedOperators.includes(operator)} onChange={(event) => setBlockForm((prev) => { const current = new Set(prev.supportedOperators); if (event.target.checked) current.add(operator); else current.delete(operator); return { ...prev, supportedOperators: Array.from(current) }; })} /><span className="font-mono">{operator}</span></label>)}</div></div>;
}

interface RewardAssetDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  editingRewardAsset: RewardAssetItem | null;
  setEditingRewardAsset: (asset: RewardAssetItem | null) => void;
  rewardAssetForm: RewardAssetFormState;
  setRewardAssetForm: Dispatch<SetStateAction<RewardAssetFormState>>;
  rewardAssetFile: File | null;
  setRewardAssetFile: (file: File | null) => void;
  onSave: () => void;
  savePending: boolean;
}

export function RewardAssetDialog({
  open,
  setOpen,
  editingRewardAsset,
  setEditingRewardAsset,
  rewardAssetForm,
  setRewardAssetForm,
  rewardAssetFile,
  setRewardAssetFile,
  onSave,
  savePending,
}: Readonly<RewardAssetDialogProps>) {
  const reset = () => {
    setOpen(false);
    setEditingRewardAsset(null);
    setRewardAssetFile(null);
    setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : reset())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRewardAsset ? "Редактирование ассета" : "Новый ассет"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Тип ассета</Label>
            <Select value={rewardAssetForm.assetType} onValueChange={(value: IconType) => setRewardAssetForm((prev) => ({ ...prev, assetType: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="badge">Бейдж</SelectItem>
                <SelectItem value="star">Звезда</SelectItem>
                <SelectItem value="title">Титул</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-name">Название</Label>
            <Input id="asset-name" value={rewardAssetForm.nameRu} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, nameRu: event.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-file">Изображение (локальный файл)</Label>
            <Input id="asset-file" type="file" accept="image/*" onChange={(event) => setRewardAssetFile(event.target.files?.[0] ?? null)} />
            {editingRewardAsset && !rewardAssetFile ? <p className="text-xs text-muted-foreground">Текущая картинка сохранится, если новый файл не выбран.</p> : null}
            {rewardAssetFile ? <p className="text-xs text-muted-foreground">Выбран файл: {rewardAssetFile.name}</p> : null}
            {!rewardAssetFile && rewardAssetForm.imageUrl ? (
              <AchievementImagePreview src={rewardAssetForm.imageUrl} alt="Предпросмотр ассета" triggerClassName="h-16 w-16 border" imageClassName="rounded" />
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asset-group">Группа</Label>
              <Input id="asset-group" value={rewardAssetForm.groupKey} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, groupKey: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-order">Порядок</Label>
              <Input id="asset-order" type="number" value={rewardAssetForm.sortOrder} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-tags">Теги (через запятую)</Label>
            <Input id="asset-tags" value={rewardAssetForm.tagsText} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, tagsText: event.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-description">Описание</Label>
            <Textarea id="asset-description" value={rewardAssetForm.descriptionRu} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, descriptionRu: event.target.value }))} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input id="asset-active" type="checkbox" checked={rewardAssetForm.isActive} onChange={(event) => setRewardAssetForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            <Label htmlFor="asset-active" className="cursor-pointer">Ассет активен</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={reset}>Отмена</Button>
          <Button onClick={onSave} disabled={savePending}>{savePending ? "Сохраняем..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkImportDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  assetType: IconType;
  setAssetType: (assetType: IconType) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  groupKey: string;
  setGroupKey: (groupKey: string) => void;
  tagsText: string;
  setTagsText: (tagsText: string) => void;
  sortStart: string;
  setSortStart: (sortStart: string) => void;
  onImport: () => void;
  importPending: boolean;
}

export function BulkImportDialog({
  open,
  setOpen,
  assetType,
  setAssetType,
  files,
  setFiles,
  groupKey,
  setGroupKey,
  tagsText,
  setTagsText,
  sortStart,
  setSortStart,
  onImport,
  importPending,
}: Readonly<BulkImportDialogProps>) {
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFiles([]);
      setGroupKey("default");
      setTagsText("");
      setSortStart("0");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Массовый импорт ассетов</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Тип импортируемых ассетов</Label>
            <Select value={assetType} onValueChange={(value: IconType) => setAssetType(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="badge">Бейдж</SelectItem>
                <SelectItem value="star">Звезда</SelectItem>
                <SelectItem value="title">Титул</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-import-files">Файлы изображений</Label>
            <Input id="bulk-import-files" type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            <p className="text-xs text-muted-foreground">Выбрано файлов: {files.length}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-import-group">Группа</Label>
              <Input id="bulk-import-group" value={groupKey} onChange={(event) => setGroupKey(event.target.value)} placeholder="default" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-import-sort-start">Начальный порядок</Label>
              <Input id="bulk-import-sort-start" type="number" value={sortStart} onChange={(event) => setSortStart(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-import-tags">Теги (через запятую, ко всем файлам)</Label>
            <Input id="bulk-import-tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="rare, seasonal" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={onImport} disabled={importPending}>{importPending ? "Импортируем..." : "Импортировать"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
