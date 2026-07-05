export function getInitialChapter(
  progress: { currentChapter: number } | null | undefined,
  progressLoading: boolean
): number | null {
  if (progressLoading) return null;
  return progress?.currentChapter || 1;
}

export function createBookmarkTitleFromSelection(selectedText: string): string {
  const normalized = selectedText.trim().replaceAll(/\s+/g, " ");
  if (!normalized) {
    return "Без названия";
  }

  const words = normalized.split(" ").filter(Boolean);
  const snippetByWords = words.slice(0, 12).join(" ");
  const baseSnippet = snippetByWords || normalized;
  const boundedSnippet = baseSnippet.length > 72
    ? `${baseSnippet.slice(0, 69).trimEnd()}...`
    : baseSnippet;

  return boundedSnippet;
}
