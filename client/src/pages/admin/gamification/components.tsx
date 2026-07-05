import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { ACHIEVEMENT_STATUS_LABELS, ICON_TYPE_LABELS, VALUE_TYPE_LABELS } from "./constants";
import type { AchievementItem, AchievementStatus, BuildingBlockItem, RewardAssetItem } from "./types";
import { summarizeAchievementRule } from "./utils";

interface AchievementsTableProps {
  achievements: AchievementItem[];
  blockByCode: Map<string, BuildingBlockItem>;
  onEdit: (item: AchievementItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

export function AchievementsTable({ achievements, blockByCode, onEdit, onDelete, deletePending }: Readonly<AchievementsTableProps>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Код</TableHead>
          <TableHead>Правило</TableHead>
          <TableHead>Тип награды</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Порядок</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {achievements.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div>
                <div className="font-medium text-gray-900">{item.titleRu}</div>
                {item.descriptionRu ? <div className="mt-1 text-xs text-gray-500">{item.descriptionRu}</div> : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{item.code}</TableCell>
            <TableCell className="max-w-72 text-sm text-gray-600">{summarizeAchievementRule(item, blockByCode)}</TableCell>
            <TableCell>{ICON_TYPE_LABELS[item.iconType]}</TableCell>
            <TableCell>
              <AchievementStatusBadge status={item.status} />
            </TableCell>
            <TableCell>{item.sortOrder}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(item.id)} disabled={deletePending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface BlocksTableProps {
  blocks: BuildingBlockItem[];
  onEdit: (item: BuildingBlockItem) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

export function BlocksTable({ blocks, onEdit, onDelete, deletePending }: Readonly<BlocksTableProps>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Название</TableHead>
          <TableHead>Код</TableHead>
          <TableHead>Тип значения</TableHead>
          <TableHead>Операторы</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {blocks.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium text-gray-900">{item.labelRu}</TableCell>
            <TableCell className="font-mono text-xs">{item.code}</TableCell>
            <TableCell>{VALUE_TYPE_LABELS[item.valueType]}</TableCell>
            <TableCell className="font-mono text-xs">{item.supportedOperators.join(", ")}</TableCell>
            <TableCell>
              <BuildingBlockStatusBadge isActive={item.isActive} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(item.id)} disabled={deletePending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AchievementStatusBadge({ status }: Readonly<{ status: AchievementStatus }>) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (status === "active") {
    className = "bg-green-50 text-green-700 border-green-200";
  } else if (status === "draft") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  return (
    <Badge variant="secondary" className={className}>
      {ACHIEVEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

function BuildingBlockStatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant="secondary" className={isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
      {isActive ? "Активен" : "Выключен"}
    </Badge>
  );
}

interface RewardAssetsGalleryContentProps {
  groupAssetsByKey: boolean;
  groupedRewardAssets: [string, RewardAssetItem[]][];
  filteredRewardAssets: RewardAssetItem[];
  selectedAssetIds: string[];
  onAssetSelect: (assetId: string, checked: boolean) => void;
  onEditAsset: (asset: RewardAssetItem) => void;
  onDeleteAsset: (id: string) => void;
  deletePending: boolean;
}

function RewardAssetRow({ asset, showGroup, selectedAssetIds, onAssetSelect, onEditAsset, onDeleteAsset, deletePending }: Readonly<{
  asset: RewardAssetItem;
  showGroup: boolean;
  selectedAssetIds: string[];
  onAssetSelect: (assetId: string, checked: boolean) => void;
  onEditAsset: (asset: RewardAssetItem) => void;
  onDeleteAsset: (id: string) => void;
  deletePending: boolean;
}>) {
  const selected = selectedAssetIds.includes(asset.id);

  return (
    <TableRow key={asset.id}>
      <TableCell>
        <input type="checkbox" checked={selected} onChange={(event) => onAssetSelect(asset.id, event.target.checked)} />
      </TableCell>
      <TableCell>
        <AchievementImagePreview src={asset.imageUrl} alt={asset.nameRu} triggerClassName="h-10 w-10 border" imageClassName="rounded" />
      </TableCell>
      <TableCell>{asset.nameRu}</TableCell>
      {showGroup ? <TableCell>{asset.groupKey}</TableCell> : null}
      <TableCell>{ICON_TYPE_LABELS[asset.assetType]}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{asset.tags.join(", ") || "-"}</TableCell>
      <TableCell>{asset.sortOrder}</TableCell>
      <TableCell>
        <Badge variant={asset.isActive ? "default" : "secondary"}>{asset.isActive ? "active" : "inactive"}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEditAsset(asset)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDeleteAsset(asset.id)} disabled={deletePending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function RewardAssetsGalleryContent(props: Readonly<RewardAssetsGalleryContentProps>) {
  if (props.groupAssetsByKey) {
    return (
      <div className="space-y-4">
        {props.groupedRewardAssets.map(([groupKey, items]) => (
          <div key={groupKey} className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <p className="font-medium">Группа: {groupKey}</p>
              <p className="text-xs text-muted-foreground">{items.length} шт.</p>
            </div>
            <RewardAssetsTable assets={items} showGroup={false} {...props} />
          </div>
        ))}
      </div>
    );
  }

  return <RewardAssetsTable assets={props.filteredRewardAssets} showGroup {...props} />;
}

function RewardAssetsTable({ assets, showGroup, ...props }: Readonly<RewardAssetsGalleryContentProps & { assets: RewardAssetItem[]; showGroup: boolean }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Превью</TableHead>
          <TableHead>Название</TableHead>
          {showGroup ? <TableHead>Группа</TableHead> : null}
          <TableHead>Тип</TableHead>
          <TableHead>Теги</TableHead>
          <TableHead>Порядок</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => <RewardAssetRow key={asset.id} asset={asset} showGroup={showGroup} {...props} />)}
      </TableBody>
    </Table>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {["1", "2", "3", "4"].map((row) => <Skeleton key={row} className="h-14 w-full" />)}
    </div>
  );
}

interface GamificationStatsProps {
  achievementSummary: { total: number; active: number; draft: number };
  rewardAssetsSummary: { total: number; active: number };
}

export function GamificationStats({ achievementSummary, rewardAssetsSummary }: Readonly<GamificationStatsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <StatCard label="Всего достижений" value={achievementSummary.total} />
      <StatCard label="Активных достижений" value={achievementSummary.active} />
      <StatCard label="Черновиков" value={achievementSummary.draft} />
      <StatCard label="Ассетов галереи" value={`${rewardAssetsSummary.active}/${rewardAssetsSummary.total}`} />
    </div>
  );
}

function StatCard({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}
