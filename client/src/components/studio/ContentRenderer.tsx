import React from "react";
import { Button } from "@/components/ui/button";
import { Upload, ChevronLeft, ChevronRight } from "lucide-react";

interface ContentRendererProps {
  uploadMode: boolean;
  contentText: string;
  currentChapter: number;
  fontSize: number[];
  lineHeight: number[];
  contentWidth: number[];
  chapterLoading: boolean;
  chapterData: any;
  chapterError: any;
  createContentMutation: any;
  deleteContentMutation: any;
  totalChapters: number;
  onContentTextChange: (text: string) => void;
  onUploadContent: () => void;
  onDeleteContent: () => void;
  onToggleUploadMode: (mode: boolean) => void;
  onChapterChange: (chapter: number) => void;
}

export function ContentRenderer({
  uploadMode,
  contentText,
  currentChapter,
  fontSize,
  lineHeight,
  contentWidth,
  chapterLoading,
  chapterData,
  chapterError,
  createContentMutation,
  deleteContentMutation,
  totalChapters,
  onContentTextChange,
  onUploadContent,
  onDeleteContent,
  onToggleUploadMode,
  onChapterChange,
}: Readonly<ContentRendererProps>) {
  if (uploadMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif font-bold text-4xl text-white">Добавить контент</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleUploadMode(false)}
            className="border-stone-600 text-stone-400"
          >
            Отмена
          </Button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-stone-300 mb-2 block">
              Текст главы {currentChapter}
            </span>
            <textarea
              value={contentText}
              onChange={(e) => onContentTextChange(e.target.value)}
              className="w-full h-96 bg-black/40 border border-stone-600 rounded-lg p-4 text-stone-300 resize-none"
              placeholder="Вставьте текст главы здесь..."
            />
          </label>
          <div className="flex gap-3">
            <Button
              onClick={onUploadContent}
              disabled={!contentText.trim() || createContentMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {createContentMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (chapterLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-stone-400">Загрузка контента...</div>
      </div>
    );
  }

  if (chapterData?.content) {
    return (
      <div
        className="font-book text-stone-300 leading-relaxed transition-all duration-200 mx-auto"
        style={{ 
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight[0],
          maxWidth: `${contentWidth}%`
        }}
      >
        <h1 className="font-serif font-bold text-4xl text-white mb-8">
          {chapterData.chapter?.title || chapterData.title || `Глава ${currentChapter}`}
        </h1>
        <div 
          className="prose prose-invert prose-stone max-w-none prose-headings:font-serif prose-headings:text-white prose-p:mb-6"
          dangerouslySetInnerHTML={{ __html: chapterData.content }}
        />
        
        {/* Chapter Navigation */}
        <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between">
          <Button
            variant="outline"
            size="lg"
            onClick={() => onChapterChange(currentChapter - 1)}
            disabled={currentChapter <= 1}
            className="border-stone-600 text-stone-400 hover:bg-stone-800 hover:text-white disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            Предыдущая глава
          </Button>
          
          <span className="text-sm text-stone-500">
            Глава {currentChapter} из {totalChapters}
          </span>
          
          <Button
            variant="outline"
            size="lg"
            onClick={() => onChapterChange(currentChapter + 1)}
            disabled={currentChapter >= totalChapters}
            className="border-stone-600 text-stone-400 hover:bg-stone-800 hover:text-white disabled:opacity-50"
          >
            Следующая глава
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <p className="text-stone-400 mb-4">Контент не найден</p>
      <Button onClick={() => onToggleUploadMode(true)} className="bg-amber-600 hover:bg-amber-700">
        <Upload className="w-4 h-4 mr-2" />
        Добавить контент
      </Button>
    </div>
  );
}
