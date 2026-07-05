export type AchievementStatus = "draft" | "active" | "archived";
export type IconType = "badge" | "star" | "title";
export type ValueType = "number" | "string" | "boolean";
export type ConditionPrimitiveValue = boolean | number | string;
export type ConditionsLogic = "AND" | "OR";
export type AssetTypeFilter = "all" | IconType;
export type AssetSortBy = "nameRu" | "createdAt" | "sortOrder" | "groupKey";
export type SortDirection = "asc" | "desc";
export type RewardInputValue = number | string | null;

export interface AchievementItem {
  id: string;
  code: string;
  titleRu: string;
  descriptionRu: string | null;
  iconType: IconType;
  badgeImageUrl: string | null;
  rewardPayload: unknown;
  conditionsPayload: unknown;
  status: AchievementStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildingBlockItem {
  id: string;
  code: string;
  labelRu: string;
  valueType: ValueType;
  supportedOperators: string[];
  sourceKey?: string | null;
  isActive: boolean;
}

export interface FieldRegistryItem {
  key: string;
  type: ValueType;
  label: string;
  group: string;
}

export interface FieldRegistryResponse {
  success: boolean;
  registry: Record<string, FieldRegistryItem[]>;
}

export interface RewardAssetItem {
  id: string;
  assetType: IconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu: string | null;
  groupKey: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewardAssetFormState {
  assetType: IconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu: string;
  groupKey: string;
  tagsText: string;
  sortOrder: string;
  isActive: boolean;
}

export interface AchievementFormState {
  code: string;
  titleRu: string;
  descriptionRu: string;
  iconType: IconType;
  badgeImageUrl: string;
  rewardTitleRu: string;
  rewardDescriptionRu: string;
  rewardValue: string;
  conditionsLogic: ConditionsLogic;
  conditions: AchievementConditionFormState[];
  status: AchievementStatus;
  sortOrder: string;
}

export type ConditionsFormFields = "conditionsLogic" | "conditions";
export type ParsedConditionsForm = Pick<AchievementFormState, ConditionsFormFields>;

export interface AchievementConditionFormState {
  id: string;
  blockCode: string;
  operator: string;
  valueType: ValueType;
  value: string;
}

export interface BuildingBlockFormState {
  code: string;
  labelRu: string;
  sourceKey: string;
  valueType: ValueType;
  supportedOperators: string[];
  isActive: boolean;
}
