import { ASSET_WEBP_QUALITY, STAR_REWARD_OPTIONS, TARGET_ASSET_SIZE } from "./constants";
import type {
  AchievementConditionFormState,
  AchievementItem,
  BuildingBlockFormState,
  BuildingBlockItem,
  ConditionPrimitiveValue,
  ConditionsLogic,
  IconType,
  ParsedConditionsForm,
  RewardInputValue,
  ValueType,
} from "./types";

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function convertFileToWebpDataUrl(file: File): Promise<string> {
  const image = await loadImageFromFile(file);

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_ASSET_SIZE;
  canvas.height = TARGET_ASSET_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось создать контекст изображения");
  }

  const scale = Math.min(TARGET_ASSET_SIZE / image.width, TARGET_ASSET_SIZE / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.round((TARGET_ASSET_SIZE - drawWidth) / 2);
  const offsetY = Math.round((TARGET_ASSET_SIZE - drawHeight) / 2);

  context.clearRect(0, 0, TARGET_ASSET_SIZE, TARGET_ASSET_SIZE);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const output = canvas.toDataURL("image/webp", ASSET_WEBP_QUALITY);
  if (!output.startsWith("data:image/webp")) {
    throw new Error("Браузер не поддерживает конвертацию в WebP");
  }

  return output;
}

export function fileNameToAssetTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Новый ассет";
}

let conditionIdCounter = 0;

function createConditionId(): string {
  conditionIdCounter += 1;
  return `condition-${conditionIdCounter}`;
}

export function createEmptyCondition(): AchievementConditionFormState {
  return {
    id: createConditionId(),
    blockCode: "",
    operator: ">=",
    valueType: "number",
    value: "",
  };
}

export function parseConditionValue(valueType: ValueType, rawValue: string): ConditionPrimitiveValue {
  if (valueType === "boolean") {
    return rawValue === "true";
  }

  if (valueType === "number") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw new TypeError("Числовое условие должно содержать корректное число");
    }
    return parsed;
  }

  return rawValue.trim();
}

function normalizeConditionValue(valueType: ValueType, value: unknown): string {
  if (valueType === "boolean") {
    return value ? "true" : "false";
  }
  if (valueType === "number") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  return typeof value === "string" ? value : "";
}

export function parseConditionsPayload(payload: unknown): ParsedConditionsForm {
  const fallback = {
    conditionsLogic: "AND" as ConditionsLogic,
    conditions: [] as AchievementConditionFormState[],
  };

  if (!payload) {
    return fallback;
  }

  let rawItems: unknown[] = [];
  if (Array.isArray(payload)) {
    rawItems = payload;
  } else if (typeof payload === "object" && payload !== null) {
    const candidateItems = (payload as { items?: unknown[] }).items;
    if (Array.isArray(candidateItems)) {
      rawItems = candidateItems;
    }
  }

  const rawLogic =
    typeof payload === "object" && payload !== null && (payload as { logic?: unknown }).logic === "OR"
      ? "OR"
      : "AND";

  const conditions = rawItems.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as {
      blockCode?: unknown;
      operator?: unknown;
      valueType?: unknown;
      value?: unknown;
    };

    if (typeof candidate.blockCode !== "string" || typeof candidate.operator !== "string") {
      return [];
    }

    const valueType: ValueType =
      candidate.valueType === "string" || candidate.valueType === "boolean" ? candidate.valueType : "number";

    return [{
      id: createConditionId(),
      blockCode: candidate.blockCode,
      operator: candidate.operator,
      valueType,
      value: normalizeConditionValue(valueType, candidate.value),
    }];
  });

  return {
    conditionsLogic: rawLogic,
    conditions,
  };
}

function stringifyRewardValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function parseRewardPayload(payload: unknown, iconType: IconType, badgeImageUrl: string | null) {
  const rawPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  return {
    rewardTitleRu: typeof rawPayload.titleRu === "string" ? rawPayload.titleRu : "",
    rewardDescriptionRu: typeof rawPayload.descriptionRu === "string" ? rawPayload.descriptionRu : "",
    rewardValue: stringifyRewardValue(rawPayload.value),
    badgeImageUrl: typeof rawPayload.badgeImageUrl === "string" ? rawPayload.badgeImageUrl : (badgeImageUrl ?? ""),
    iconType,
  };
}

export function achievementToForm(item: AchievementItem) {
  const parsedConditions = parseConditionsPayload(item.conditionsPayload);
  const parsedReward = parseRewardPayload(item.rewardPayload, item.iconType, item.badgeImageUrl);

  return {
    code: item.code,
    titleRu: item.titleRu,
    descriptionRu: item.descriptionRu ?? "",
    iconType: parsedReward.iconType,
    badgeImageUrl: parsedReward.badgeImageUrl,
    rewardTitleRu: parsedReward.rewardTitleRu,
    rewardDescriptionRu: parsedReward.rewardDescriptionRu,
    rewardValue: parsedReward.rewardValue,
    conditionsLogic: parsedConditions.conditionsLogic,
    conditions: parsedConditions.conditions,
    status: item.status,
    sortOrder: String(item.sortOrder),
  };
}

export function blockToForm(item: BuildingBlockItem): BuildingBlockFormState {
  return {
    code: item.code,
    labelRu: item.labelRu,
    sourceKey: item.sourceKey ?? "",
    valueType: item.valueType,
    supportedOperators: item.supportedOperators,
    isActive: item.isActive,
  };
}

export function sourceKeyToCode(sourceKey: string): string {
  const parts = sourceKey.split(".");
  return parts.at(-1) ?? sourceKey;
}

export function formatConditionPreview(condition: AchievementConditionFormState, block?: BuildingBlockItem): string {
  const label = block?.labelRu ?? (condition.blockCode || "Параметр");
  let value = condition.value;
  if (condition.valueType === "boolean") {
    value = condition.value === "true" ? "Да" : "Нет";
  }
  return `${label} ${condition.operator} ${value || "—"}`;
}

export function parseRewardValueInput(rewardValue: string): RewardInputValue {
  const trimmed = rewardValue.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return trimmed;
}

export function summarizeConditions(
  conditions: AchievementConditionFormState[],
  logic: ConditionsLogic,
  blockByCode: Map<string, BuildingBlockItem>,
): string {
  if (conditions.length === 0) {
    return "Без условий";
  }

  const parts = conditions.map((condition) => formatConditionPreview(condition, blockByCode.get(condition.blockCode)));
  if (parts.length === 1) {
    return parts[0];
  }

  const preview = parts.slice(0, 2).join(` ${logic} `);
  if (parts.length > 2) {
    return `${preview} и еще ${parts.length - 2}`;
  }

  return preview;
}

export function summarizeAchievementRule(item: AchievementItem, blockByCode: Map<string, BuildingBlockItem>): string {
  const parsed = parseConditionsPayload(item.conditionsPayload);
  return summarizeConditions(parsed.conditions, parsed.conditionsLogic, blockByCode);
}

export function describeRewardValue(iconType: IconType, rewardValue: string): string {
  if (!rewardValue.trim()) {
    return "не задано";
  }

  if (iconType === "star") {
    return `${rewardValue} звезд`;
  }

  if (iconType === "title") {
    return rewardValue;
  }

  return "визуальный бейдж";
}

export function getDefaultRewardValue(iconType: IconType, currentValue: string): string {
  if (iconType === "badge") {
    return "";
  }

  if (iconType === "star") {
    return STAR_REWARD_OPTIONS.includes(currentValue as typeof STAR_REWARD_OPTIONS[number]) ? currentValue : "1";
  }

  return currentValue;
}

export function getConditionValuePlaceholder(condition: AchievementConditionFormState): string {
  if (condition.valueType === "number") {
    return "365";
  }

  if (condition.blockCode === "favorite_genre") {
    return "Напр.: Фантастика, Детские* или *";
  }

  return "Значение";
}

export function getUpdatedAssetIds(prev: string[], assetId: string, checked: boolean): string[] {
  if (checked) {
    return prev.includes(assetId) ? prev : [...prev, assetId];
  }
  return prev.filter((id) => id !== assetId);
}
