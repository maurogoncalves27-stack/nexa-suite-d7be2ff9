import { useEffect, useMemo, useState } from "react";
import { Loader2, BookOpen, Search, Pencil, Trash2, Clock, FileDown } from "lucide-react";
import { generateRecipeBookPdf, imageUrlToDataUrl } from "@/lib/recipeBookPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import RecipeBookEditorDialog from "@/components/recipes/RecipeBookEditorDialog";
import { toast } from "sonner";

interface RecipeBookRow {
  id: string;
  title: string;
  description: string | null;
  photo_path: string | null;
  yield_text: string | null;
  prep_time_minutes: number | null;
  source_recipe_name: string | null;
  ingredients: string | null;
  preparation_method: string | null;
  created_at: string;
}

const RecipeBook = () => {
  const { isAdmin, isManager } = useAuth();
  const canEdit = isAdmin || isManager;

  const [items, setItems] = useState<RecipeBookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recipe_books")
      .select("id, title, description, photo_path, yield_text, prep_time_minutes, source_recipe_name, ingredients, preparation_method, created_at")
      .order("title");
    if (error) toast.error(error.message);
    setItems((data as RecipeBookRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (r) =>
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const photoUrl = (path: string | null) =>
    path ? supabase.storage.from("recipe-book-photos").getPublicUrl(path).data.publicUrl : null;

  const handleDelete = async (item: RecipeBookRow) => {
    if (item.photo_path) {
      await supabase.storage.from("recipe-book-photos").remove([item.photo_path]);
    }
    const { error } = await supabase.from("recipe_books").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Receituário excluído");
    void load();
  };

  const handleDownloadPdf = async (item: RecipeBookRow) => {
    try {
      const url = photoUrl(item.photo_path);
      const photoDataUrl = url ? await imageUrlToDataUrl(url) : null;
      await generateRecipeBookPdf({
        title: item.title,
        description: item.description,
        yield_text: item.yield_text,
        prep_time_minutes: item.prep_time_minutes,
        ingredients: item.ingredients,
        preparation_method: item.preparation_method,
        photoDataUrl,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" /> Receituário
        </h1>
        <p className="text-muted-foreground">
          Receituários gerados a partir das fichas técnicas. Editar ou excluir aqui não afeta a ficha original.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Galeria</CardTitle>
          <CardDescription>{items.length} receituário(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum receituário ainda. Vá em <strong>Fichas técnicas</strong> e clique em
              <em> Gerar receituário</em> em qualquer ficha.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((r) => {
                const url = photoUrl(r.photo_path);
                return (
                  <div key={r.id} className="border rounded-md overflow-hidden flex flex-col">
                    {url ? (
                      <img src={url} alt={r.title} className="h-40 w-full object-cover" />
                    ) : (
                      <div className="h-40 w-full bg-muted flex items-center justify-center">
                        <BookOpen className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-3 flex-1 flex flex-col gap-1">
                      <p className="font-medium leading-tight">{r.title}</p>
                      {r.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                      )}
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        {r.yield_text && <span>{r.yield_text}</span>}
                        {r.prep_time_minutes && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {r.prep_time_minutes} min
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDownloadPdf(r)}
                        >
                          <FileDown className="h-3.5 w-3.5" /> PDF
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(r.id);
                                setEditorOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir receituário?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    A ficha técnica original não será afetada. Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(r)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <RecipeBookEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        recipeBookId={editingId}
        onSaved={load}
      />
    </div>
  );
};

export default RecipeBook;
