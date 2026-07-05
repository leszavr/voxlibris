import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Blocks, Trophy } from "lucide-react";
import { AchievementsTable, BlocksTable, TableSkeleton } from "./components";
import type { AchievementItem, AssetSortBy, AssetTypeFilter, BuildingBlockItem, SortDirection } from "./types";

interface AchievementsTabContentProps {
  achievementStatusFilter: string;
  onStatusFilterChange: (value: string) => void;
  achievementsContent: React.ReactNode;
}

export function AchievementsTabContent({ achievementStatusFilter, onStatusFilterChange, achievementsContent }: Readonly<AchievementsTabContentProps>) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Каталог достижений
          </CardTitle>
          <CardDescription>Здесь создаются и редактируются достижения, их условия и награды.</CardDescription>
        </div>

        <div className="w-full lg:w-56">
          <Label htmlFor="achievement-status-filter">Фильтр по статусу</Label>
          <Select value={achievementStatusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger id="achievement-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="draft">Черновик</SelectItem>
              <SelectItem value="active">Активно</SelectItem>
              <SelectItem value="archived">В архиве</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>{achievementsContent}</CardContent>
    </Card>
  );
}

interface BlocksTabContentProps {
  includeInactiveBlocks: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
  blocksContent: React.ReactNode;
}

export function BlocksTabContent({ includeInactiveBlocks, onIncludeInactiveChange, blocksContent }: Readonly<BlocksTabContentProps>) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Blocks className="h-5 w-5" />
            Параметры условий
          </CardTitle>
          <CardDescription>Базовые параметры, из которых администратор собирает условия достижений.</CardDescription>
        </div>

        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input id="include-inactive-blocks" type="checkbox" checked={includeInactiveBlocks} onChange={(event) => onIncludeInactiveChange(event.target.checked)} />
          <Label htmlFor="include-inactive-blocks" className="cursor-pointer">Показывать выключенные</Label>
        </div>
      </CardHeader>
      <CardContent>{blocksContent}</CardContent>
    </Card>
  );
}

interface GalleryTabContentProps {
  assetSearch: string;
  onAssetSearchChange: (value: string) => void;
  assetTypeFilter: AssetTypeFilter;
  onAssetTypeFilterChange: (value: AssetTypeFilter) => void;
  assetSortBy: AssetSortBy;
  onAssetSortByChange: (value: AssetSortBy) => void;
  assetSortDir: SortDirection;
  onAssetSortDirChange: (value: SortDirection) => void;
  groupAssetsByKey: boolean;
  onGroupAssetsByKeyChange: (value: boolean) => void;
  includeInactiveAssets: boolean;
  onIncludeInactiveAssetsChange: (value: boolean) => void;
  onBulkImportClick: () => void;
  selectedAssetIds: string[];
  onBulkDelete: () => void;
  bulkDeletePending: boolean;
  galleryContent: React.ReactNode;
}

export function GalleryTabContent({
  assetSearch,
  onAssetSearchChange,
  assetTypeFilter,
  onAssetTypeFilterChange,
  assetSortBy,
  onAssetSortByChange,
  assetSortDir,
  onAssetSortDirChange,
  groupAssetsByKey,
  onGroupAssetsByKeyChange,
  includeInactiveAssets,
  onIncludeInactiveAssetsChange,
  onBulkImportClick,
  selectedAssetIds,
  onBulkDelete,
  bulkDeletePending,
  galleryContent,
}: Readonly<GalleryTabContentProps>) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>Галерея наград</CardTitle>
          <CardDescription>Полноценный реестр ассетов: поиск, сортировка, группировка, массовый импорт и удаление.</CardDescription>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <Input placeholder="Поиск по названию, группе, тегам" value={assetSearch} onChange={(event) => onAssetSearchChange(event.target.value)} className="lg:col-span-2" />
          <Select value={assetTypeFilter} onValueChange={(value: AssetTypeFilter) => onAssetTypeFilterChange(value)}>
            <SelectTrigger><SelectValue placeholder="Тип" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="badge">Бейдж</SelectItem>
              <SelectItem value="star">Звезда</SelectItem>
              <SelectItem value="title">Титул</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assetSortBy} onValueChange={(value: AssetSortBy) => onAssetSortByChange(value)}>
            <SelectTrigger><SelectValue placeholder="Сортировка" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sortOrder">По порядку</SelectItem>
              <SelectItem value="nameRu">По названию</SelectItem>
              <SelectItem value="groupKey">По группе</SelectItem>
              <SelectItem value="createdAt">По дате</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assetSortDir} onValueChange={(value: SortDirection) => onAssetSortDirChange(value)}>
            <SelectTrigger><SelectValue placeholder="Направление" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">По возрастанию</SelectItem>
              <SelectItem value="desc">По убыванию</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 rounded-lg border px-3">
            <input id="include-inactive-assets" type="checkbox" checked={includeInactiveAssets} onChange={(event) => onIncludeInactiveAssetsChange(event.target.checked)} />
            <Label htmlFor="include-inactive-assets" className="cursor-pointer">Показывать выключенные</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onGroupAssetsByKeyChange(!groupAssetsByKey)}>
            {groupAssetsByKey ? "Выключить группировку" : "Группировать по группе"}
          </Button>
          <Button variant="outline" onClick={onBulkImportClick}>Массовый импорт</Button>
          <Button variant="destructive" disabled={selectedAssetIds.length === 0 || bulkDeletePending} onClick={onBulkDelete}>
            Удалить выбранные ({selectedAssetIds.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>{galleryContent}</CardContent>
    </Card>
  );
}

export function renderAchievementsContent(params: {
  isLoading: boolean;
  isError: boolean;
  achievements: AchievementItem[];
  blockByCode: Map<string, BuildingBlockItem>;
  onEdit: (item: AchievementItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}): React.ReactNode {
  if (params.isLoading) {
    return <TableSkeleton />;
  }

  if (params.isError) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Не удалось загрузить достижения.</div>;
  }

  return <AchievementsTable achievements={params.achievements} blockByCode={params.blockByCode} onEdit={params.onEdit} onDelete={params.onDelete} deletePending={params.deletePending} />;
}

export function renderBlocksContent(params: {
  isLoading: boolean;
  isError: boolean;
  blocks: BuildingBlockItem[];
  onEdit: (item: BuildingBlockItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}): React.ReactNode {
  if (params.isLoading) {
    return <TableSkeleton />;
  }

  if (params.isError) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Не удалось загрузить параметры условий.</div>;
  }

  return <BlocksTable blocks={params.blocks} onEdit={params.onEdit} onDelete={params.onDelete} deletePending={params.deletePending} />;
}
