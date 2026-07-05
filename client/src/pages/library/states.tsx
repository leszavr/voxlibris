import { ArrowLeft, Library as LibraryIcon, LogIn } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MainLayout } from "@/components/layout/MainLayout";

export function LibraryLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:gap-6 sm:p-6">
          <Skeleton className="w-full sm:w-48 aspect-[2/3] shrink-0 rounded-lg" />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-4 w-1/4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyLibraryState() {
  return (
    <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
      <LibraryIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="font-medium">Ваша библиотека пуста</h3>
      <p className="text-muted-foreground max-w-sm mx-auto mt-2">
        Добавьте свою первую книгу, загрузив файл EPUB или FB2 через кнопку "Загрузить книгу" выше.
      </p>
    </div>
  );
}

export function LibraryAuthRequired({ setLocation }: { setLocation: (path: string) => void }) {
  return (
    <MainLayout>
      <div className="container flex justify-center px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <LogIn className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle>Требуется авторизация</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Личная библиотека доступна только авторизованным пользователям. Войдите в систему или зарегистрируйтесь,
              чтобы загружать и читать свои книги.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button asChild>
                <Link href="/auth/login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Войти / Регистрация
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")}> 
                <ArrowLeft className="h-4 w-4 mr-2" />
                На главную
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
