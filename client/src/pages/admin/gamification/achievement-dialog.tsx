import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { ICON_TYPE_LABELS, OPERATOR_HELP, STAR_REWARD_OPTIONS } from "./constants";
import type { AchievementConditionFormState, AchievementFormState, AchievementItem, AchievementStatus, BuildingBlockItem, ConditionPrimitiveValue, ConditionsLogic, IconType, RewardAssetItem } from "./types";
import { describeRewardValue, formatConditionPreview, getConditionValuePlaceholder, getDefaultRewardValue } from "./utils";

interface AchievementDialogProps {
  open: boolean;
  reset: () => void;
  setOpen: (open: boolean) => void;
  editingAchievement: AchievementItem | null;
  achievementForm: AchievementFormState;
  setAchievementForm: Dispatch<SetStateAction<AchievementFormState>>;
  rewardAssetsByType: Record<IconType, RewardAssetItem[]>;
  activeBlocks: BuildingBlockItem[];
  blockByCode: Map<string, BuildingBlockItem>;
  selectedFieldValues: Record<string, ConditionPrimitiveValue[]>;
  isLoadingFieldValues: Record<string, boolean>;
  achievementRuleSummary: string;
  addCondition: () => void;
  updateCondition: (conditionId: string, updates: Partial<AchievementConditionFormState>) => void;
  removeCondition: (conditionId: string) => void;
  onSave: () => void;
  savePending: boolean;
}

export function AchievementDialog({
  open,
  reset,
  setOpen,
  editingAchievement,
  achievementForm,
  setAchievementForm,
  rewardAssetsByType,
  activeBlocks,
  blockByCode,
  selectedFieldValues,
  isLoadingFieldValues,
  achievementRuleSummary,
  addCondition,
  updateCondition,
  removeCondition,
  onSave,
  savePending,
}: Readonly<AchievementDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : reset())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingAchievement ? "Редактирование достижения" : "Новое достижение"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField id="achievement-title" label="Название" value={achievementForm.titleRu} onChange={(value) => setAchievementForm((prev) => ({ ...prev, titleRu: value }))} />
          <TextField id="achievement-code" label="Код" value={achievementForm.code} disabled={Boolean(editingAchievement)} onChange={(value) => setAchievementForm((prev) => ({ ...prev, code: value }))} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="achievement-description">Описание</Label>
            <Textarea id="achievement-description" value={achievementForm.descriptionRu} onChange={(event) => setAchievementForm((prev) => ({ ...prev, descriptionRu: event.target.value }))} />
          </div>
          <RewardTypeSelect achievementForm={achievementForm} setAchievementForm={setAchievementForm} />
          <RewardAssetSelect achievementForm={achievementForm} setAchievementForm={setAchievementForm} rewardAssetsByType={rewardAssetsByType} />
          <TextField id="achievement-reward-title" label="Название награды" value={achievementForm.rewardTitleRu} placeholder="Например, Годовасик" onChange={(value) => setAchievementForm((prev) => ({ ...prev, rewardTitleRu: value }))} />
          <RewardValueInput achievementForm={achievementForm} setAchievementForm={setAchievementForm} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="achievement-reward-description">Описание награды</Label>
            <Textarea id="achievement-reward-description" value={achievementForm.rewardDescriptionRu} onChange={(event) => setAchievementForm((prev) => ({ ...prev, rewardDescriptionRu: event.target.value }))} placeholder="Короткое пояснение, что получает пользователь" />
          </div>
          <StatusSelect value={achievementForm.status} onChange={(status) => setAchievementForm((prev) => ({ ...prev, status }))} />
          <TextField id="achievement-sort-order" label="Порядок сортировки" type="number" value={achievementForm.sortOrder} onChange={(value) => setAchievementForm((prev) => ({ ...prev, sortOrder: value }))} />
          <ConditionsBuilder achievementForm={achievementForm} setAchievementForm={setAchievementForm} activeBlocks={activeBlocks} blockByCode={blockByCode} selectedFieldValues={selectedFieldValues} isLoadingFieldValues={isLoadingFieldValues} addCondition={addCondition} updateCondition={updateCondition} removeCondition={removeCondition} />
          <AchievementPreview achievementForm={achievementForm} blockByCode={blockByCode} achievementRuleSummary={achievementRuleSummary} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={reset}>Отмена</Button>
          <Button onClick={onSave} disabled={savePending}>{savePending ? "Сохраняем..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ id, label, value, onChange, disabled, placeholder, type = "text" }: Readonly<{ id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; type?: string }>) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}

function RewardTypeSelect({ achievementForm, setAchievementForm }: Readonly<{ achievementForm: AchievementFormState; setAchievementForm: Dispatch<SetStateAction<AchievementFormState>> }>) {
  return <div className="space-y-2"><Label>Тип награды</Label><Select value={achievementForm.iconType} onValueChange={(value: IconType) => setAchievementForm((prev) => ({ ...prev, iconType: value, rewardValue: getDefaultRewardValue(value, prev.rewardValue) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="badge">Бейдж</SelectItem><SelectItem value="star">Звезда</SelectItem><SelectItem value="title">Титул</SelectItem></SelectContent></Select></div>;
}

function RewardAssetSelect({ achievementForm, setAchievementForm, rewardAssetsByType }: Readonly<{ achievementForm: AchievementFormState; setAchievementForm: Dispatch<SetStateAction<AchievementFormState>>; rewardAssetsByType: Record<IconType, RewardAssetItem[]> }>) {
  const assets = rewardAssetsByType[achievementForm.iconType];
  return <div className="space-y-2"><Label>Вид награды</Label><div className="rounded-lg border p-3 space-y-3"><Label htmlFor="achievement-reward-asset-select">Выбрать</Label><Select value={achievementForm.badgeImageUrl || "__none"} onValueChange={(value) => setAchievementForm((prev) => ({ ...prev, badgeImageUrl: value === "__none" ? "" : value }))}><SelectTrigger id="achievement-reward-asset-select"><SelectValue placeholder="Выберите ассет из галереи" /></SelectTrigger><SelectContent><SelectItem value="__none">Без изображения</SelectItem>{assets.map((asset) => <SelectItem key={asset.id} value={asset.imageUrl}>{asset.nameRu} ({asset.groupKey})</SelectItem>)}</SelectContent></Select>{assets.length === 0 ? <p className="text-sm text-gray-500">Для типа «{ICON_TYPE_LABELS[achievementForm.iconType]}» пока нет активных ассетов в галерее.</p> : null}{achievementForm.badgeImageUrl ? <div className="rounded-lg border bg-slate-50 p-3"><p className="mb-2 text-sm font-medium text-gray-700">Предпросмотр</p><AchievementImagePreview src={achievementForm.badgeImageUrl} alt="Предпросмотр награды" triggerClassName="h-24 w-24" imageClassName="rounded-lg" /></div> : null}</div></div>;
}

function RewardValueInput({ achievementForm, setAchievementForm }: Readonly<{ achievementForm: AchievementFormState; setAchievementForm: Dispatch<SetStateAction<AchievementFormState>> }>) {
  return <div className="space-y-2"><Label>Параметры награды</Label><div className="rounded-lg border p-3">{achievementForm.iconType === "badge" ? <div className="space-y-2 text-sm text-gray-600"><p>Для бейджа отдельное числовое значение не требуется.</p><p>Пользователь получает выбранный визуальный бейдж и описание награды.</p></div> : null}{achievementForm.iconType === "star" ? <div className="space-y-2"><Label htmlFor="achievement-reward-stars">Количество звезд</Label><Select value={achievementForm.rewardValue || "1"} onValueChange={(value) => setAchievementForm((prev) => ({ ...prev, rewardValue: value }))}><SelectTrigger id="achievement-reward-stars"><SelectValue /></SelectTrigger><SelectContent>{STAR_REWARD_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div> : null}{achievementForm.iconType === "title" ? <TextField id="achievement-reward-title-value" label="Текст титула" value={achievementForm.rewardValue} placeholder="Почетный читатель" onChange={(value) => setAchievementForm((prev) => ({ ...prev, rewardValue: value }))} /> : null}</div></div>;
}

function StatusSelect({ value, onChange }: Readonly<{ value: AchievementStatus; onChange: (value: AchievementStatus) => void }>) {
  return <div className="space-y-2"><Label>Статус</Label><Select value={value} onValueChange={(next: AchievementStatus) => onChange(next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Черновик</SelectItem><SelectItem value="active">Активно</SelectItem><SelectItem value="archived">В архиве</SelectItem></SelectContent></Select></div>;
}

function ConditionsBuilder(props: Readonly<{ achievementForm: AchievementFormState; setAchievementForm: Dispatch<SetStateAction<AchievementFormState>>; activeBlocks: BuildingBlockItem[]; blockByCode: Map<string, BuildingBlockItem>; selectedFieldValues: Record<string, ConditionPrimitiveValue[]>; isLoadingFieldValues: Record<string, boolean>; addCondition: () => void; updateCondition: (conditionId: string, updates: Partial<AchievementConditionFormState>) => void; removeCondition: (conditionId: string) => void }>) {
  return <div className="space-y-2 md:col-span-2"><div className="flex items-center justify-between gap-3"><Label>Конструктор условий</Label><Button type="button" variant="outline" size="sm" onClick={props.addCondition}><Plus className="mr-2 h-4 w-4" />Добавить условие</Button></div><div className="rounded-lg border p-4 space-y-4"><div className="w-full md:w-48 space-y-2"><Label>Логика</Label><Select value={props.achievementForm.conditionsLogic} onValueChange={(value: ConditionsLogic) => props.setAchievementForm((prev) => ({ ...prev, conditionsLogic: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AND">AND</SelectItem><SelectItem value="OR">OR</SelectItem></SelectContent></Select></div>{props.achievementForm.conditions.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">Пока нет условий. Добавьте хотя бы одно правило для выдачи достижения.</div> : <div className="space-y-3">{props.achievementForm.conditions.map((condition, index) => <ConditionRow key={condition.id} condition={condition} index={index} {...props} />)}</div>}</div></div>;
}

function ConditionRow({ condition, index, activeBlocks, blockByCode, selectedFieldValues, isLoadingFieldValues, updateCondition, removeCondition }: Readonly<{ condition: AchievementConditionFormState; index: number; activeBlocks: BuildingBlockItem[]; blockByCode: Map<string, BuildingBlockItem>; selectedFieldValues: Record<string, ConditionPrimitiveValue[]>; isLoadingFieldValues: Record<string, boolean>; updateCondition: (conditionId: string, updates: Partial<AchievementConditionFormState>) => void; removeCondition: (conditionId: string) => void }>) {
  const block = blockByCode.get(condition.blockCode);
  const operators = block?.supportedOperators ?? [condition.operator || ">="];
  const fieldKey = block?.sourceKey;
  const fieldValues = fieldKey ? selectedFieldValues[fieldKey] : undefined;
  const isLoading = !!(fieldKey && isLoadingFieldValues[fieldKey]);
  return <div className="rounded-lg border p-3 space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-700">Условие {index + 1}</p><Button type="button" variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => removeCondition(condition.id)}><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_1fr]"><SelectBox label="Параметр" value={condition.blockCode} onChange={(value) => updateCondition(condition.id, { blockCode: value })} items={activeBlocks.map((item) => ({ value: item.code, label: item.labelRu }))} placeholder="Выберите параметр условия" /><SelectBox label="Оператор" value={condition.operator} onChange={(value) => updateCondition(condition.id, { operator: value })} items={operators.map((operator) => ({ value: operator, label: operator, title: OPERATOR_HELP[operator] ?? operator }))} /> <ConditionValue condition={condition} fieldValues={fieldValues} isLoading={isLoading} updateCondition={updateCondition} /></div></div>;
}

function SelectBox({ label, value, onChange, items, placeholder }: Readonly<{ label: string; value: string; onChange: (value: string) => void; items: { value: string; label: string; title?: string }[]; placeholder?: string }>) {
  return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value} title={item.title}>{item.label}</SelectItem>)}</SelectContent></Select></div>;
}

function ConditionValue({ condition, fieldValues, isLoading, updateCondition }: Readonly<{ condition: AchievementConditionFormState; fieldValues?: ConditionPrimitiveValue[]; isLoading: boolean; updateCondition: (conditionId: string, updates: Partial<AchievementConditionFormState>) => void }>) {
  if (condition.valueType === "boolean") {
    return <SelectBox label="Значение" value={condition.value || "false"} onChange={(value) => updateCondition(condition.id, { value })} items={[{ value: "true", label: "Да" }, { value: "false", label: "Нет" }]} />;
  }
  return <div className="space-y-2"><Label>Значение</Label>{fieldValues?.length ? <Select value={condition.value} onValueChange={(value) => updateCondition(condition.id, { value })}><SelectTrigger><SelectValue placeholder="Выберите значение" /></SelectTrigger><SelectContent>{fieldValues.map((val) => <SelectItem key={String(val)} value={String(val)}>{String(val)}</SelectItem>)}</SelectContent></Select> : <Input type={condition.valueType === "number" ? "number" : "text"} value={condition.value} onChange={(event) => updateCondition(condition.id, { value: event.target.value })} placeholder={getConditionValuePlaceholder(condition)} disabled={isLoading} />}{condition.blockCode === "favorite_genre" ? <p className="text-xs text-muted-foreground">Поддерживается список через запятую, шаблон `*` и префиксы: например `Детские*`.</p> : null}</div>;
}

function AchievementPreview({ achievementForm, blockByCode, achievementRuleSummary }: Readonly<{ achievementForm: AchievementFormState; blockByCode: Map<string, BuildingBlockItem>; achievementRuleSummary: string }>) {
  return <div className="space-y-2 md:col-span-2"><Label>Предпросмотр правила</Label><div className="rounded-lg border bg-slate-50 p-4 space-y-3 text-sm"><div><p className="font-medium text-gray-900">{achievementForm.titleRu || "Без названия"}</p><p className="text-gray-500">{achievementForm.descriptionRu || "Описание не задано"}</p></div><div><p className="font-medium text-gray-700">Условия</p>{achievementForm.conditions.length === 0 ? <p className="text-gray-500">Условия пока не заданы.</p> : <div className="mt-2 space-y-1">{achievementForm.conditions.map((condition, index) => <p key={condition.id} className="text-gray-600">{index > 0 ? `${achievementForm.conditionsLogic} ` : ""}{formatConditionPreview(condition, blockByCode.get(condition.blockCode))}</p>)}</div>}<p className="mt-2 text-gray-700"><span className="font-medium">Кратко:</span> {achievementRuleSummary}</p></div><div><p className="font-medium text-gray-700">Награда</p><p className="text-gray-600">Тип: {ICON_TYPE_LABELS[achievementForm.iconType]}{achievementForm.rewardTitleRu ? `, название: ${achievementForm.rewardTitleRu}` : ""}{achievementForm.rewardValue ? `, значение: ${describeRewardValue(achievementForm.iconType, achievementForm.rewardValue)}` : ""}</p>{achievementForm.rewardDescriptionRu ? <p className="text-gray-500 mt-1">{achievementForm.rewardDescriptionRu}</p> : null}</div></div></div>;
}
