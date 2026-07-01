import { supabase } from "@/integrations/supabase/client";

/**
 * Gera um receituário (snapshot independente) a partir de uma ficha técnica.
 * Após criado, o receituário NÃO está mais ligado à ficha — pode ser editado
 * ou excluído sem afetá-la.
 */
export async function generateRecipeBookFromRecipe(recipeId: string): Promise<string> {
  // Carrega a receita + ingredientes + produto final
  const { data: recipe, error: recipeErr } = await supabase
    .from("recipes")
    .select(
      "id, name, yield_quantity, yield_unit, prep_time_minutes, photo_path, output_product_id, scope, inventory_products(name, unit)"
    )
    .eq("id", recipeId)
    .single();
  if (recipeErr || !recipe) throw new Error(recipeErr?.message ?? "Ficha não encontrada");

  const { data: ingredients, error: ingErr } = await supabase
    .from("recipe_ingredients")
    .select("quantity, inventory_products(name, unit)")
    .eq("recipe_id", recipeId);
  if (ingErr) throw new Error(ingErr.message);

  // Snapshot dos ingredientes em texto
  const ingredientsText = (ingredients ?? [])
    .map((it: { quantity: number; inventory_products: { name: string; unit: string } | null }) => {
      const name = it.inventory_products?.name ?? "—";
      const unit = it.inventory_products?.unit ?? "";
      const qty = Number(it.quantity).toLocaleString("pt-BR");
      return `• ${qty} ${unit} ${name}`.trim();
    })
    .join("\n");

  const yieldText = `${Number(recipe.yield_quantity).toLocaleString("pt-BR")} ${recipe.yield_unit}`;

  // Copia a foto da ficha (se houver) para o bucket do receituário
  let photoPath: string | null = null;
  if (recipe.photo_path) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("recipe-photos")
      .download(recipe.photo_path);
    if (!dlErr && blob) {
      const ext = recipe.photo_path.split(".").pop() || "jpg";
      const newPath = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("recipe-book-photos")
        .upload(newPath, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
      if (!upErr) photoPath = newPath;
    }
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { data: inserted, error: insErr } = await supabase
    .from("recipe_books")
    .insert({
      title: recipe.name,
      description: recipe.inventory_products?.name ?? null,
      photo_path: photoPath,
      ingredients: ingredientsText,
      preparation_method: null,
      yield_text: yieldText,
      prep_time_minutes: recipe.prep_time_minutes,
      source_recipe_name: recipe.name,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  return inserted.id;
}
