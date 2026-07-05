import type { AchievementFormState, AchievementStatus, BuildingBlockFormState, IconType, RewardAssetFormState, ValueType } from "./types";

export const OPERATOR_OPTIONS_BY_VALUE_TYPE: Record<ValueType, string[]> = {
  number: [">", ">=", "=", "!=", "<", "<=", "IN", "NOT IN"],
  string: ["=", "!=", "IN", "NOT IN", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH"],
  boolean: ["=", "!="],
};

export const OPERATOR_HELP: Record<string, string> = {
  ">": "Больше чем. Пример: completed_books > 5",
  ">=": "Больше или равно. Пример: tenure_days >= 30",
  "=": "Равно. Пример: profile_completed = true",
  "!=": "Не равно. Пример: favorite_genre != Драма",
  "<": "Меньше чем. Пример: sent_dm_count < 10",
  "<=": "Меньше или равно. Пример: current_streak_days <= 3",
  "IN": "Входит в список. Пример: favorite_genre IN Фантастика,Фэнтези",
  "NOT IN": "Не входит в список. Пример: favorite_genre NOT IN Драма,Ужасы",
  "CONTAINS": "Содержит подстроку. Пример: favorite_genre CONTAINS Детские",
  "NOT CONTAINS": "Не содержит подстроку. Пример: favorite_genre NOT CONTAINS 18+",
  "STARTS WITH": "Начинается с. Пример: favorite_genre STARTS WITH Детские",
  "ENDS WITH": "Заканчивается на. Пример: favorite_genre ENDS WITH фика",
};

export const ACHIEVEMENT_STATUS_LABELS: Record<AchievementStatus, string> = {
  draft: "Черновик",
  active: "Активно",
  archived: "В архиве",
};

export const ICON_TYPE_LABELS: Record<IconType, string> = {
  badge: "Бейдж",
  star: "Звезда",
  title: "Титул",
};

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  number: "Число",
  string: "Строка",
  boolean: "Да/нет",
};

export const STAR_REWARD_OPTIONS = ["1", "2", "3", "4", "5"] as const;

export const TARGET_ASSET_SIZE = 256;
export const ASSET_WEBP_QUALITY = 0.9;

export const EMPTY_ACHIEVEMENT_FORM: AchievementFormState = {
  code: "",
  titleRu: "",
  descriptionRu: "",
  iconType: "badge",
  badgeImageUrl: "",
  rewardTitleRu: "",
  rewardDescriptionRu: "",
  rewardValue: "",
  conditionsLogic: "AND",
  conditions: [],
  status: "draft",
  sortOrder: "0",
};

export const EMPTY_BLOCK_FORM: BuildingBlockFormState = {
  code: "",
  labelRu: "",
  sourceKey: "",
  valueType: "number",
  supportedOperators: [">=", "<=", "="],
  isActive: true,
};

export const EMPTY_REWARD_ASSET_FORM: RewardAssetFormState = {
  assetType: "badge",
  nameRu: "",
  imageUrl: "",
  descriptionRu: "",
  groupKey: "default",
  tagsText: "",
  sortOrder: "0",
  isActive: true,
};
