import { useEffect, useState } from "react";
import { Loader2, Upload, Trash2, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RecipeBookRow {
  id: string;
  title: string;
  description: string | null;
  photo_path: string | null;
  ingredients: string | null;
  preparation_method: string | null;
  yield_text: string | null;
  prep_time_minutes: number | null;
  source_recipe_name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipeBookId: string | null;
  onSaved: () => void;
  scope?: "loja" | "fabrica";
}

const RecipeBookEditorDialog = ({ open, onOpenChange, recipeBookId, onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [data, setData] = useState<RecipeBookRow>({
    id: "",
    title: "",
    description: "",
    photo_path: null,
    ingredients: "",
    preparation_method: "",
    yield_text: "",
    prep_time_minutes: null,
    source_recipe_name: null,
  });

  useEffect(() => {
    if (!open || !recipeBookId) return;
    setLoading(true);
    void supabase
      .from("recipe_books")
      .select("*")
      .eq("id", recipeBookId)
      .single()
      .then(({ data: row, error }) => {
        if (error) toast.error(error.message);
        else if (row) setData(row as RecipeBookRow);
        setLoading(false);
      });
  }, [open, recipeBookId]);

  const photoUrl = data.photo_path
    ? supabase.storage.from("recipe-book-photos").getPublicUrl(data.photo_path).data.publicUrl
    : null;

  const handlePhotoUpload = async (file: File) => {
    if (!data.id) {
      toast.error("Salve o receituário antes de enviar a foto");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("recipe-book-photos")
        .upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      if (data.photo_path) {
        await supabase.storage.from("recipe-book-photos").remove([data.photo_path]);
      }
      const { error: updErr } = await supabase
        .from("recipe_books")
        .update({ photo_path: path })
        .eq("id", data.id);
      if (updErr) throw updErr;
      setData((d) => ({ ...d, photo_path: path }));
      toast.success("Foto atualizada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoRemove = async () => {
    if (!data.id || !data.photo_path) return;
    await supabase.storage.from("recipe-book-photos").remove([data.photo_path]);
    await supabase.from("recipe_books").update({ photo_path: null }).eq("id", data.id);
    setData((d) => ({ ...d, photo_path: null }));
  };

  const save = async () => {
    if (!data.title.trim()) {
      toast.error("Informe o título");
      return;
    }
    setSaving(true);
    const payload = {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      photo_path: data.photo_path,
      ingredients: data.ingredients?.trim() || null,
      preparation_method: data.preparation_method?.trim() || null,
      yield_text: data.yield_text?.trim() || null,
      prep_time_minutes: data.prep_time_minutes,
    };
    const { error } = await supabase.from("recipe_books").update(payload).eq("id", data.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Receituário salvo");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar receituário</DialogTitle>
          <DialogDescription>
            Este receituário é independente da ficha técnica. Alterações aqui não afetam a ficha.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} />
            </div>

            <div>
              <Label>Descrição curta</Label>
              <Input
                value={data.description ?? ""}
                onChange={(e) => setData({ ...data, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Rendimento (texto)</Label>
                <Input
                  placeholder="Ex.: 10 porções"
                  value={data.yield_text ?? ""}
                  onChange={(e) => setData({ ...data, yield_text: e.target.value })}
                />
              </div>
              <div>
                <Label>Tempo de preparo (minutos)</Label>
                <Input
                  type="number"
                  min={0}
                  value={data.prep_time_minutes ?? ""}
                  onChange={(e) =>
                    setData({
                      ...data,
                      prep_time_minutes: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div>
              <Label>Foto do prato</Label>
              <div className="mt-1 flex items-center gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt={data.title} className="h-20 w-20 rounded object-cover border" />
                ) : (
                  <div className="h-20 w-20 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label>
                    <Button asChild size="sm" variant="outline" disabled={uploadingPhoto}>
                      <span className="cursor-pointer gap-1">
                        {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {data.photo_path ? "Trocar foto" : "Enviar foto"}
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePhotoUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {data.photo_path && (
                    <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={handlePhotoRemove}>
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label>Ingredientes</Label>
              <Textarea
                rows={6}
                placeholder="Liste os ingredientes (um por linha)…"
                value={data.ingredients ?? ""}
                onChange={(e) => setData({ ...data, ingredients: e.target.value })}
              />
            </div>

            <div>
              <Label>Modo de preparo</Label>
              <Textarea
                rows={8}
                placeholder="Descreva o passo a passo do preparo…"
                value={data.preparation_method ?? ""}
                onChange={(e) => setData({ ...data, preparation_method: e.target.value })}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeBookEditorDialog;
