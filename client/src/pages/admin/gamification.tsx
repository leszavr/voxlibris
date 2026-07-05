import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  Plus,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  EMPTY_ACHIEVEMENT_FORM,
  EMPTY_BLOCK_FORM,
  EMPTY_REWARD_ASSET_FORM,
  OPERATOR_OPTIONS_BY_VALUE_TYPE,
} from "./gamification/constants";
import {
  GamificationStats,
  RewardAssetsGalleryContent,
  TableSkeleton,
} from "./gamification/components";
import { AchievementsTabContent, BlocksTabContent, GalleryTabContent, renderAchievementsContent, renderBlocksContent } from "./gamification/tabs";
import { BlockDialog, BulkImportDialog, RewardAssetDialog } from "./gamification/dialogs";
import { AchievementDialog } from "./gamification/achievement-dialog";
import type {
  AchievementConditionFormState,
  AchievementFormState,
  AchievementItem,
  AssetSortBy,
  AssetTypeFilter,
  BuildingBlockFormState,
  BuildingBlockItem,
  ConditionPrimitiveValue,
  FieldRegistryResponse,
  IconType,
  RewardAssetFormState,
  RewardAssetItem,
  SortDirection,
} from "./gamification/types";
import {
  achievementToForm,
  blockToForm,
  convertFileToWebpDataUrl,
  createEmptyCondition,
  fileNameToAssetTitle,
  getUpdatedAssetIds,
  parseConditionValue,
  parseRewardValueInput,
  sourceKeyToCode,
  summarizeConditions,
} from "./gamification/utils";

async function fetchAchievements(status: string): Promise<AchievementItem[]> {
  const params = new URLSearchParams();
  if (status !== "all") {
    params.set("status", status);
  }

  const query = params.toString();
  const response = await apiRequest<{ success: boolean; achievements: AchievementItem[] }>(
    query ? `/api/admin/gamification/achievements?${query}` : "/api/admin/gamification/achievements",
  );
  return response.achievements;
}

async function fetchBuildingBlocks(includeInactive: boolean): Promise<BuildingBlockItem[]> {
  const params = new URLSearchParams({ includeInactive: String(includeInactive) });
  const response = await apiRequest<{ success: boolean; blocks: BuildingBlockItem[] }>(
    `/api/admin/gamification/building-blocks?${params.toString()}`,
  );
  return response.blocks;
}

async function fetchRewardAssets(includeInactive: boolean): Promise<RewardAssetItem[]> {
  const params = new URLSearchParams({ includeInactive: String(includeInactive) });
  const response = await apiRequest<{ success: boolean; assets: RewardAssetItem[] }>(
    `/api/admin/gamification/reward-assets?${params.toString()}`,
  );
  return response.assets;
}

// Этап 7: Функции для ручного пересчёта
async function runReconcile(): Promise<{ success: boolean; summary: unknown }> {
  const response = await apiRequest<{ success: boolean; summary: unknown }>(
    "/api/admin/gamification/reconcile/run",
    {
      method: "POST",
      body: JSON.stringify({ batchSize: 100 }),
    },
  );
  return response;
}

export default function AdminGamificationPage() { // NOSONAR: orchestration component with UI state wiring
  const queryClient = useQueryClient();
  const [achievementStatusFilter, setAchievementStatusFilter] = useState<string>("all");
  const [includeInactiveBlocks, setIncludeInactiveBlocks] = useState(true);
  const [achievementDialogOpen, setAchievementDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<AchievementItem | null>(null);
  const [editingBlock, setEditingBlock] = useState<BuildingBlockItem | null>(null);
  const [editingRewardAsset, setEditingRewardAsset] = useState<RewardAssetItem | null>(null);
  const [achievementForm, setAchievementForm] = useState<AchievementFormState>(EMPTY_ACHIEVEMENT_FORM);
  const [blockForm, setBlockForm] = useState<BuildingBlockFormState>(EMPTY_BLOCK_FORM);
  const [blockFieldPopoverOpen, setBlockFieldPopoverOpen] = useState(false);
  const [rewardAssetForm, setRewardAssetForm] = useState<RewardAssetFormState>(EMPTY_REWARD_ASSET_FORM);
  const [rewardAssetDialogOpen, setRewardAssetDialogOpen] = useState(false);
  const [rewardAssetFile, setRewardAssetFile] = useState<File | null>(null);
  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [bulkImportAssetType, setBulkImportAssetType] = useState<IconType>("badge");
  const [bulkImportFiles, setBulkImportFiles] = useState<File[]>([]);
  const [bulkImportGroupKey, setBulkImportGroupKey] = useState("default");
  const [bulkImportTagsText, setBulkImportTagsText] = useState("");
  const [bulkImportSortStart, setBulkImportSortStart] = useState("0");
  const [includeInactiveAssets, setIncludeInactiveAssets] = useState(true);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [assetSortBy, setAssetSortBy] = useState<AssetSortBy>("sortOrder");
  const [assetSortDir, setAssetSortDir] = useState<SortDirection>("asc");
  const [groupAssetsByKey, setGroupAssetsByKey] = useState(true);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // Этап 4: Field-registry для динамического конструктора условий
  const [selectedFieldValues, setSelectedFieldValues] = useState<Record<string, ConditionPrimitiveValue[]>>({});
  const [isLoadingFieldValues, setIsLoadingFieldValues] = useState<Record<string, boolean>>({});

  const achievementsQuery = useQuery({
    queryKey: ["admin-gamification-achievements", achievementStatusFilter],
    queryFn: () => fetchAchievements(achievementStatusFilter),
  });

  const blocksQuery = useQuery({
    queryKey: ["admin-gamification-blocks", includeInactiveBlocks],
    queryFn: () => fetchBuildingBlocks(includeInactiveBlocks),
  });

  const fieldRegistryQuery = useQuery({
    queryKey: ["admin-gamification-field-registry"],
    queryFn: async () => {
      return await apiRequest<FieldRegistryResponse>("/api/admin/gamification/field-registry");
    },
    staleTime: 5 * 60 * 1000,
  });

  const rewardAssetsQuery = useQuery({
    queryKey: ["admin-gamification-reward-assets", includeInactiveAssets],
    queryFn: () => fetchRewardAssets(includeInactiveAssets),
  });

  const fieldRegistryGroups = fieldRegistryQuery.data?.registry ?? {};
  const fieldRegistryOptions = useMemo(
    () => Object.values(fieldRegistryGroups).flat(),
    [fieldRegistryGroups],
  );
  const selectedBlockField = useMemo(
    () => fieldRegistryOptions.find((field) => field.key === blockForm.sourceKey) ?? null,
    [fieldRegistryOptions, blockForm.sourceKey],
  );

  const blockByCode = useMemo(() => {
    return new Map((blocksQuery.data ?? []).map((item) => [item.code, item]));
  }, [blocksQuery.data]);

  const achievementRuleSummary = useMemo(
    () => summarizeConditions(achievementForm.conditions, achievementForm.conditionsLogic, blockByCode),
    [achievementForm.conditions, achievementForm.conditionsLogic, blockByCode],
  );

  const activeBlocks = useMemo(
    () => (blocksQuery.data ?? []).filter((item) => item.isActive),
    [blocksQuery.data],
  );

  const achievementSummary = useMemo(() => {
    const items = achievementsQuery.data ?? [];
    return {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      draft: items.filter((item) => item.status === "draft").length,
    };
  }, [achievementsQuery.data]);

  const rewardAssetsSummary = useMemo(() => {
    const items = rewardAssetsQuery.data ?? [];
    return {
      total: items.length,
      active: items.filter((item) => item.isActive).length,
    };
  }, [rewardAssetsQuery.data]);

  const filteredRewardAssets = useMemo(() => {
    const normalizedSearch = assetSearch.trim().toLowerCase();
    const source = rewardAssetsQuery.data ?? [];

    const filtered = source.filter((item) => {
      if (assetTypeFilter !== "all" && item.assetType !== assetTypeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [item.nameRu, item.groupKey, item.descriptionRu ?? "", ...(item.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    const sorted = [...filtered].sort((a, b) => {
      const direction = assetSortDir === "asc" ? 1 : -1;

      if (assetSortBy === "sortOrder") {
        return (a.sortOrder - b.sortOrder) * direction;
      }

      if (assetSortBy === "createdAt") {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }

      const left = (a[assetSortBy] ?? "").toString().toLowerCase();
      const right = (b[assetSortBy] ?? "").toString().toLowerCase();
      if (left === right) return 0;
      return left > right ? direction : -direction;
    });

    return sorted;
  }, [rewardAssetsQuery.data, assetSearch, assetTypeFilter, assetSortBy, assetSortDir]);

  const groupedRewardAssets = useMemo(() => {
    const map = new Map<string, RewardAssetItem[]>();
    filteredRewardAssets.forEach((item) => {
      const key = item.groupKey || "default";
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [filteredRewardAssets]);

  const rewardAssetsByType = useMemo(() => {
    const source = rewardAssetsQuery.data ?? [];
    return {
      badge: source.filter((item) => item.assetType === "badge" && item.isActive),
      star: source.filter((item) => item.assetType === "star" && item.isActive),
      title: source.filter((item) => item.assetType === "title" && item.isActive),
    };
  }, [rewardAssetsQuery.data]);

  const resetAchievementDialog = () => {
    setEditingAchievement(null);
    setAchievementForm(EMPTY_ACHIEVEMENT_FORM);
    setAchievementDialogOpen(false);
  };

  const resetBlockDialog = () => {
    setEditingBlock(null);
    setBlockForm(EMPTY_BLOCK_FORM);
    setBlockDialogOpen(false);
  };

  const invalidateAchievements = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-achievements"] });
  };

  const invalidateBlocks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-blocks"] });
  };

  const invalidateRewardAssets = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-gamification-reward-assets"] });
  };

  const saveAchievementMutation = useMutation({
    mutationFn: async () => {
      if (achievementForm.status === "active" && achievementForm.conditions.length === 0) {
        throw new Error("Нельзя сохранить активное достижение без условий");
      }

      if (achievementForm.iconType === "star" && !achievementForm.rewardValue.trim()) {
        throw new Error("Для награды типа «Звезда» нужно указать количество звезд");
      }

      if (achievementForm.iconType === "title" && !achievementForm.rewardValue.trim()) {
        throw new Error("Для награды типа «Титул» нужно указать текст титула");
      }

      const conditionsPayload = {
        logic: achievementForm.conditionsLogic,
        items: achievementForm.conditions.map((condition) => ({
          blockCode: condition.blockCode,
          operator: condition.operator,
          valueType: condition.valueType,
          value: parseConditionValue(condition.valueType, condition.value),
        })),
      };

      const payload = {
        code: achievementForm.code.trim(),
        titleRu: achievementForm.titleRu.trim(),
        descriptionRu: achievementForm.descriptionRu.trim() || null,
        iconType: achievementForm.iconType,
        badgeImageUrl: achievementForm.badgeImageUrl.trim() || null,
        rewardPayload: {
          kind: achievementForm.iconType,
          titleRu: achievementForm.rewardTitleRu.trim() || null,
          descriptionRu: achievementForm.rewardDescriptionRu.trim() || null,
          value: parseRewardValueInput(achievementForm.rewardValue),
          badgeImageUrl: achievementForm.badgeImageUrl.trim() || null,
        },
        conditionsPayload,
        status: achievementForm.status,
        sortOrder: Number(achievementForm.sortOrder || "0"),
      };

      if (editingAchievement) {
        return apiRequest(`/api/admin/gamification/achievements/${editingAchievement.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/achievements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingAchievement ? "Достижение обновлено" : "Достижение создано" });
      await invalidateAchievements();
      resetAchievementDialog();
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить достижение",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteAchievementMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/gamification/achievements/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      toast({ title: "Достижение удалено" });
      await invalidateAchievements();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить достижение",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const saveBlockMutation = useMutation({
    mutationFn: async () => {
      if (blockForm.supportedOperators.length === 0) {
        throw new Error("Нужно выбрать хотя бы один оператор");
      }

      const payload = {
        code: blockForm.code.trim(),
        labelRu: blockForm.labelRu.trim(),
        sourceKey: blockForm.sourceKey.trim() || null,
        valueType: blockForm.valueType,
        supportedOperators: blockForm.supportedOperators,
        isActive: blockForm.isActive,
      };

      if (editingBlock) {
        return apiRequest(`/api/admin/gamification/building-blocks/${editingBlock.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/building-blocks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingBlock ? "Параметр условия обновлен" : "Параметр условия создан" });
      await invalidateBlocks();
      resetBlockDialog();
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить параметр условия",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/gamification/building-blocks/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      toast({ title: "Параметр условия удален" });
      await invalidateBlocks();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить параметр условия",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const saveRewardAssetMutation = useMutation({
    mutationFn: async () => {
      const imageUrl = rewardAssetFile
        ? await convertFileToWebpDataUrl(rewardAssetFile)
        : rewardAssetForm.imageUrl.trim();

      if (!imageUrl) {
        throw new Error("Нужно выбрать локальное изображение");
      }

      const payload = {
        assetType: rewardAssetForm.assetType,
        nameRu: rewardAssetForm.nameRu.trim(),
        imageUrl,
        descriptionRu: rewardAssetForm.descriptionRu.trim() || null,
        groupKey: rewardAssetForm.groupKey.trim() || "default",
        tags: rewardAssetForm.tagsText.split(",").map((item) => item.trim()).filter(Boolean),
        sortOrder: Number(rewardAssetForm.sortOrder || "0"),
        isActive: rewardAssetForm.isActive,
      };

      if (editingRewardAsset) {
        return apiRequest(`/api/admin/gamification/reward-assets/${editingRewardAsset.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest("/api/admin/gamification/reward-assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast({ title: editingRewardAsset ? "Ассет обновлен" : "Ассет добавлен" });
      await invalidateRewardAssets();
      setEditingRewardAsset(null);
      setRewardAssetFile(null);
      setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
      setRewardAssetDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Не удалось сохранить ассет",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const deleteRewardAssetMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/admin/gamification/reward-assets/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Ассет удален" });
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить ассет",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteRewardAssetsMutation = useMutation({
    mutationFn: async (ids: string[]) => apiRequest<{ success: boolean; deletedCount: number }>("/api/admin/gamification/reward-assets/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
    onSuccess: async (result) => {
      toast({ title: "Массовое удаление выполнено", description: `Удалено: ${result.deletedCount}` });
      setSelectedAssetIds([]);
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить выбранные ассеты",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const bulkImportRewardAssetsMutation = useMutation({
    mutationFn: async () => {
      if (bulkImportFiles.length === 0) {
        throw new Error("Выберите хотя бы один файл");
      }

      const commonTags = bulkImportTagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
      const sortStart = Number(bulkImportSortStart || "0");

      const items = await Promise.all(
        bulkImportFiles.map(async (file, index) => ({
          assetType: bulkImportAssetType,
          nameRu: fileNameToAssetTitle(file.name),
          imageUrl: await convertFileToWebpDataUrl(file),
          groupKey: bulkImportGroupKey.trim() || "default",
          tags: commonTags,
          sortOrder: Number.isFinite(sortStart) ? sortStart + index : index,
        })),
      );

      return apiRequest<{ success: boolean; createdCount: number }>("/api/admin/gamification/reward-assets/bulk-import", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: async (result) => {
      toast({ title: "Массовый импорт завершен", description: `Создано: ${result.createdCount}` });
      setBulkImportDialogOpen(false);
      setBulkImportFiles([]);
      setBulkImportGroupKey("default");
      setBulkImportTagsText("");
      setBulkImportSortStart("0");
      await invalidateRewardAssets();
    },
    onError: (error) => {
      toast({
        title: "Не удалось импортировать ассеты",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  // Этап 7: Mutation для reconcile (ручной пересчёт)
  const reconcileMutation = useMutation({
    mutationFn: runReconcile,
    onSuccess: async (result) => {
      toast({
        title: "Пересчёт завершен",
        description: `Результаты: ${JSON.stringify(result.summary)}`,
      });
      // Инвалидируем query для обновления данных
      queryClient.invalidateQueries({ queryKey: ["admin-gamification-achievements"] });
    },
    onError: (error) => {
      toast({
        title: "Не удалось запустить пересчёт",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const addCondition = () => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createEmptyCondition()],
    }));
  };

  const applyFieldSelection = (fieldKey: string) => {
    const selectedField = fieldRegistryOptions.find((field) => field.key === fieldKey);
    if (!selectedField) {
      return;
    }

    setBlockForm((prev) => {
      const allowedOperators = new Set(OPERATOR_OPTIONS_BY_VALUE_TYPE[selectedField.type]);
      const preservedOperators = prev.supportedOperators.filter((operator) => allowedOperators.has(operator));

      return {
        ...prev,
        sourceKey: selectedField.key,
        code: sourceKeyToCode(selectedField.key),
        valueType: selectedField.type,
        supportedOperators: preservedOperators.length > 0 ? preservedOperators : [...OPERATOR_OPTIONS_BY_VALUE_TYPE[selectedField.type]],
      };
    });

    if (selectedField.type === "string") {
      loadFieldValues(selectedField.key);
    }
  };

  const loadFieldValues = async (fieldKey: string) => {
    if (selectedFieldValues[fieldKey]) {
      return; // Already cached
    }

    setIsLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const data = await apiRequest<{ success: boolean; field: string; values: ConditionPrimitiveValue[] }>(
        `/api/admin/gamification/field-values?field=${encodeURIComponent(fieldKey)}&limit=200`,
      );
      setSelectedFieldValues((prev) => ({
        ...prev,
        [fieldKey]: data.values ?? [],
      }));
    } catch {
      // Silent fail - field values are optional for UI
    } finally {
      setIsLoadingFieldValues((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const updateCondition = (conditionId: string, updates: Partial<AchievementConditionFormState>) => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((condition) => {
        if (condition.id !== conditionId) {
          return condition;
        }

        const nextCondition = { ...condition, ...updates };

        if (updates.blockCode) {
          const block = blockByCode.get(updates.blockCode);
          if (block) {
            nextCondition.valueType = block.valueType;
            nextCondition.operator = block.supportedOperators[0] ?? nextCondition.operator;
            nextCondition.value = block.valueType === "boolean" ? "false" : "";

            // Этап 4: Загружаем DISTINCT values для string field'ов если есть sourceKey
            if (block.sourceKey && block.valueType === "string") {
              loadFieldValues(block.sourceKey);
            }
          }
        }

        return nextCondition;
      }),
    }));
  };

  const removeCondition = (conditionId: string) => {
    setAchievementForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((condition) => condition.id !== conditionId),
    }));
  };

  const handleEditAchievement = (item: AchievementItem) => {
    setEditingAchievement(item);
    setAchievementForm(achievementToForm(item));
    setAchievementDialogOpen(true);
  };

  const handleEditBlock = (item: BuildingBlockItem) => {
    setEditingBlock(item);
    setBlockForm(blockToForm(item));
    setBlockDialogOpen(true);
  };

  const handleEditRewardAsset = (item: RewardAssetItem) => {
    setEditingRewardAsset(item);
    setRewardAssetFile(null);
    setRewardAssetForm({
      assetType: item.assetType,
      nameRu: item.nameRu,
      imageUrl: item.imageUrl,
      descriptionRu: item.descriptionRu ?? "",
      groupKey: item.groupKey,
      tagsText: (item.tags ?? []).join(", "),
      sortOrder: String(item.sortOrder ?? 0),
      isActive: item.isActive,
    });
    setRewardAssetDialogOpen(true);
  };

  const openCreateRewardAssetDialog = () => {
    setEditingRewardAsset(null);
    setRewardAssetFile(null);
    setRewardAssetForm(EMPTY_REWARD_ASSET_FORM);
    setRewardAssetDialogOpen(true);
  };

   const handleAssetSelect = (assetId: string, checked: boolean) => {
     setSelectedAssetIds((prev) => getUpdatedAssetIds(prev, assetId, checked));
   };

   const achievementsContent = renderAchievementsContent({
    isLoading: achievementsQuery.isLoading,
    isError: achievementsQuery.isError,
    achievements: achievementsQuery.data ?? [],
    blockByCode,
    onEdit: handleEditAchievement,
    onDelete: (id) => deleteAchievementMutation.mutate(id),
    deletePending: deleteAchievementMutation.isPending,
  });

  const blocksContent = renderBlocksContent({
    isLoading: blocksQuery.isLoading,
    isError: blocksQuery.isError,
    blocks: blocksQuery.data ?? [],
    onEdit: handleEditBlock,
    onDelete: (id) => deleteBlockMutation.mutate(id),
    deletePending: deleteBlockMutation.isPending,
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Геймификация</h1>
            <p className="mt-2 text-gray-600">
              Отдельный раздел для управления достижениями, наградами и параметрами условий.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={openCreateRewardAssetDialog}
              title="Новый ассет"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новый ассет</span>
              <span className="sm:hidden">Ассет</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => {
                setEditingBlock(null);
                setBlockForm(EMPTY_BLOCK_FORM);
                setBlockDialogOpen(true);
              }}
              title="Новый параметр условия"
            >
              <Blocks className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новый параметр</span>
              <span className="sm:hidden">Параметр</span>
            </Button>
            <Button
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => {
                setEditingAchievement(null);
                setAchievementForm(EMPTY_ACHIEVEMENT_FORM);
                setAchievementDialogOpen(true);
              }}
              title="Новое достижение"
            >
              <Trophy className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Новое достижение</span>
              <span className="sm:hidden">Достижение</span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 sm:justify-center"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              title="Пересчитать достижения"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">
                {reconcileMutation.isPending ? "Пересчитываю..." : "Пересчитать достижения"}
              </span>
              <span className="sm:hidden">Пересчёт</span>
            </Button>
          </div>
        </div>

        <GamificationStats achievementSummary={achievementSummary} rewardAssetsSummary={rewardAssetsSummary} />

        <Tabs defaultValue="achievements" className="space-y-6">
          <TabsList>
            <TabsTrigger value="achievements">Достижения</TabsTrigger>
            <TabsTrigger value="blocks">Параметры условий</TabsTrigger>
            <TabsTrigger value="gallery">Галерея</TabsTrigger>
          </TabsList>

          <TabsContent value="achievements" className="space-y-6">
            <AchievementsTabContent
              achievementStatusFilter={achievementStatusFilter}
              onStatusFilterChange={setAchievementStatusFilter}
              achievementsContent={achievementsContent}
            />
          </TabsContent>

          <TabsContent value="blocks" className="space-y-6">
            <BlocksTabContent
              includeInactiveBlocks={includeInactiveBlocks}
              onIncludeInactiveChange={setIncludeInactiveBlocks}
              blocksContent={blocksContent}
            />
          </TabsContent>

          <TabsContent value="gallery" className="space-y-6">
            <GalleryTabContent
              assetSearch={assetSearch}
              onAssetSearchChange={setAssetSearch}
              assetTypeFilter={assetTypeFilter}
              onAssetTypeFilterChange={setAssetTypeFilter}
              assetSortBy={assetSortBy}
              onAssetSortByChange={setAssetSortBy}
              assetSortDir={assetSortDir}
              onAssetSortDirChange={setAssetSortDir}
              groupAssetsByKey={groupAssetsByKey}
              onGroupAssetsByKeyChange={setGroupAssetsByKey}
              includeInactiveAssets={includeInactiveAssets}
              onIncludeInactiveAssetsChange={setIncludeInactiveAssets}
              onBulkImportClick={() => setBulkImportDialogOpen(true)}
              selectedAssetIds={selectedAssetIds}
              onBulkDelete={() => bulkDeleteRewardAssetsMutation.mutate(selectedAssetIds)}
              bulkDeletePending={bulkDeleteRewardAssetsMutation.isPending}
              galleryContent={
                <>
                  {rewardAssetsQuery.isLoading ? <TableSkeleton /> : null}
                  {rewardAssetsQuery.isError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Не удалось загрузить ассеты галереи.</div>
                  ) : null}
                  {!rewardAssetsQuery.isLoading && !rewardAssetsQuery.isError ? (
                    <RewardAssetsGalleryContent
                      groupAssetsByKey={groupAssetsByKey}
                      groupedRewardAssets={groupedRewardAssets}
                      filteredRewardAssets={filteredRewardAssets}
                      selectedAssetIds={selectedAssetIds}
                      onAssetSelect={handleAssetSelect}
                      onEditAsset={handleEditRewardAsset}
                      onDeleteAsset={deleteRewardAssetMutation.mutate}
                      deletePending={deleteRewardAssetMutation.isPending}
                    />
                  ) : null}
                </>
              }
            />
          </TabsContent>
        </Tabs>
      </div>

      <AchievementDialog
        open={achievementDialogOpen}
        setOpen={setAchievementDialogOpen}
        reset={resetAchievementDialog}
        editingAchievement={editingAchievement}
        achievementForm={achievementForm}
        setAchievementForm={setAchievementForm}
        rewardAssetsByType={rewardAssetsByType}
        activeBlocks={activeBlocks}
        blockByCode={blockByCode}
        selectedFieldValues={selectedFieldValues}
        isLoadingFieldValues={isLoadingFieldValues}
        achievementRuleSummary={achievementRuleSummary}
        addCondition={addCondition}
        updateCondition={updateCondition}
        removeCondition={removeCondition}
        onSave={() => saveAchievementMutation.mutate()}
        savePending={saveAchievementMutation.isPending}
      />

      <BlockDialog
        open={blockDialogOpen}
        setOpen={setBlockDialogOpen}
        reset={resetBlockDialog}
        editingBlock={editingBlock}
        blockForm={blockForm}
        setBlockForm={setBlockForm}
        blockFieldPopoverOpen={blockFieldPopoverOpen}
        setBlockFieldPopoverOpen={setBlockFieldPopoverOpen}
        fieldRegistryLoading={fieldRegistryQuery.isLoading}
        fieldRegistryError={fieldRegistryQuery.isError}
        fieldRegistryGroups={fieldRegistryGroups}
        selectedBlockField={selectedBlockField}
        applyFieldSelection={applyFieldSelection}
        onSave={() => saveBlockMutation.mutate()}
        savePending={saveBlockMutation.isPending}
      />

      <RewardAssetDialog
        open={rewardAssetDialogOpen}
        setOpen={setRewardAssetDialogOpen}
        editingRewardAsset={editingRewardAsset}
        setEditingRewardAsset={setEditingRewardAsset}
        rewardAssetForm={rewardAssetForm}
        setRewardAssetForm={setRewardAssetForm}
        rewardAssetFile={rewardAssetFile}
        setRewardAssetFile={setRewardAssetFile}
        onSave={() => saveRewardAssetMutation.mutate()}
        savePending={saveRewardAssetMutation.isPending}
      />

      <BulkImportDialog
        open={bulkImportDialogOpen}
        setOpen={setBulkImportDialogOpen}
        assetType={bulkImportAssetType}
        setAssetType={setBulkImportAssetType}
        files={bulkImportFiles}
        setFiles={setBulkImportFiles}
        groupKey={bulkImportGroupKey}
        setGroupKey={setBulkImportGroupKey}
        tagsText={bulkImportTagsText}
        setTagsText={setBulkImportTagsText}
        sortStart={bulkImportSortStart}
        setSortStart={setBulkImportSortStart}
        onImport={() => bulkImportRewardAssetsMutation.mutate()}
        importPending={bulkImportRewardAssetsMutation.isPending}
      />
    </AdminLayout>
  );
}
