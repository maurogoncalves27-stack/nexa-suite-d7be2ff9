import { supabase } from "@/integrations/supabase/client";

export type MenuChannel = "totem" | "site" | "pdv" | "garcom" | "ifood";
export type MenuFulfillment = "delivery" | "pickup";

export const MENU_CHANNELS: { value: MenuChannel; label: string }[] = [
  { value: "totem", label: "Totem" },
  { value: "site", label: "Site (/pedir)" },
  { value: "pdv", label: "PDV" },
  { value: "garcom", label: "Garçom" },
  { value: "ifood", label: "iFood" },
];

export const MENU_FULFILLMENTS: { value: MenuFulfillment; label: string }[] = [
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Retirada" },
];

export interface CatalogCategory {
  id: string;
  name: string;
  sort_order: number;
  brand_id?: string | null;
  is_yolo_exclusive?: boolean;
}

export interface CatalogMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_id: string | null;
  photo_path: string | null;
  recipe_id?: string | null;
  photo_url?: string | null;
  is_active?: boolean;
  channels?: string[] | null;
  fulfillment?: string[] | null;
}


export interface CatalogComplementOption {
  id: string;
  name: string;
  extra_price: number;
}

export interface CatalogComplementGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  options: CatalogComplementOption[];
}

export interface SelectedComplement {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  extra_price: number;
}

const publicUrl = (bucket: string, path?: string | null) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

export interface MenuCatalogOptions {
  /** Canal de venda; filtra itens que não estão habilitados nele. */
  channel?: MenuChannel;
  /** Modalidade escolhida pelo cliente (entrega x retirada). */
  fulfillment?: MenuFulfillment;
  /** Só libera categorias exclusivas Yolo quando o código foi validado. */
  yoloUnlocked?: boolean;
  /** Data/hora usada na checagem das janelas (default: agora). */
  now?: Date;
}

/** Verifica se um horário está dentro da janela (com suporte a virada de dia). */
const isWithinWindow = (minutes: number, start: string, end: string) => {
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":");
    return Number(h) * 60 + Number(m ?? 0);
  };
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (endMin >= startMin) return minutes >= startMin && minutes <= endMin;
  return minutes >= startMin || minutes <= endMin;
};

/** Fonte única de leitura do cardápio por loja física e, opcionalmente, marca. */
export async function loadMenuCatalog(
  storeId: string,
  brandId?: string | null,
  options: MenuCatalogOptions = {},
) {
  const [storeLinks, brandLinks] = await Promise.all([
    (supabase as any).from("menu_item_stores").select("menu_item_id")
      .eq("store_id", storeId).eq("is_available", true),
    brandId
      ? supabase.from("menu_item_brands").select("menu_item_id").eq("brand_id", brandId)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (storeLinks.error) throw storeLinks.error;
  if (brandLinks.error) throw brandLinks.error;

  const storeIds = new Set<string>((storeLinks.data ?? []).map((row: any) => row.menu_item_id));
  const brandIds = brandId
    ? new Set<string>((brandLinks.data ?? []).map((row: any) => row.menu_item_id))
    : null;
  const itemIds = Array.from(storeIds).filter((id) => !brandIds || brandIds.has(id));
  if (itemIds.length === 0) return { categories: [] as CatalogCategory[], items: [] as CatalogMenuItem[] };

  const [itemsResult, categoriesResult] = await Promise.all([
    (supabase as any).from("menu_items")
      .select("id,name,description,price,category_id,photo_path,recipe_id,is_active,sort_order,channels,fulfillment")
      .in("id", itemIds).eq("is_active", true).order("sort_order"),
    brandId
      ? (supabase as any).from("menu_categories").select("id,name,sort_order,brand_id,is_yolo_exclusive")
        .or(`brand_id.eq.${brandId},brand_id.is.null`).order("sort_order")
      : (supabase as any).from("menu_categories").select("id,name,sort_order,brand_id,is_yolo_exclusive").order("sort_order"),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  let items = (itemsResult.data ?? []).map((item: any) => ({ ...item, price: Number(item.price) })) as CatalogMenuItem[];
  const recipeIds = Array.from(new Set(items.map((item) => item.recipe_id).filter(Boolean) as string[]));
  const [recipesResult, booksResult] = await Promise.all([
    recipeIds.length
      ? supabase.from("recipes").select("id,photo_path").in("id", recipeIds)
      : Promise.resolve({ data: [], error: null }),
    (supabase as any).from("recipe_books").select("menu_item_id,recipe_id,photo_path")
      .not("photo_path", "is", null)
      .or(`menu_item_id.in.(${itemIds.join(",")})${recipeIds.length ? `,recipe_id.in.(${recipeIds.join(",")})` : ""}`)
      .order("updated_at", { ascending: true }),
  ]);

  const recipePhotos = new Map<string, string>();
  for (const recipe of recipesResult.data ?? []) {
    const url = publicUrl("recipe-photos", (recipe as any).photo_path);
    if (url) recipePhotos.set((recipe as any).id, url);
  }
  const bookByItem = new Map<string, string>();
  const bookByRecipe = new Map<string, string>();
  for (const book of booksResult.data ?? []) {
    const url = publicUrl("recipe-book-photos", book.photo_path);
    if (!url) continue;
    if (book.menu_item_id) bookByItem.set(book.menu_item_id, url);
    if (book.recipe_id) bookByRecipe.set(book.recipe_id, url);
  }
  items = items.map((item) => ({
    ...item,
    // Receituário é a fonte visual mais recente: tem prioridade sobre a ficha técnica.
    photo_url: bookByItem.get(item.id)
      ?? (item.recipe_id ? bookByRecipe.get(item.recipe_id) : null)
      ?? publicUrl("menu-photos", item.photo_path)
      ?? (item.recipe_id ? recipePhotos.get(item.recipe_id) : null)
      ?? null,
  }));

  // Canal e modalidade por item (arrays vazios/nulos = disponível em tudo)
  const { channel, fulfillment, yoloUnlocked, now } = options;
  if (channel) {
    items = items.filter((item) => !item.channels?.length || item.channels.includes(channel));
  }
  if (fulfillment) {
    items = items.filter((item) => !item.fulfillment?.length || item.fulfillment.includes(fulfillment));
  }

  let categories = (categoriesResult.data ?? []) as CatalogCategory[];

  // Categorias exclusivas Yolo: só com código validado e dentro da janela da loja
  const yoloCategoryIds = categories.filter((c) => c.is_yolo_exclusive).map((c) => c.id);
  if (yoloCategoryIds.length) {
    let allowed = new Set<string>();
    if (yoloUnlocked) {
      const { data: windows } = await (supabase as any)
        .from("menu_category_store_windows")
        .select("category_id,weekday,start_time,end_time")
        .eq("store_id", storeId)
        .in("category_id", yoloCategoryIds);
      const reference = now ?? new Date();
      const weekday = reference.getDay();
      const minutes = reference.getHours() * 60 + reference.getMinutes();
      for (const window of (windows ?? []) as any[]) {
        if (window.weekday !== weekday) continue;
        if (isWithinWindow(minutes, String(window.start_time), String(window.end_time))) {
          allowed.add(window.category_id);
        }
      }
    }
    const blocked = new Set(yoloCategoryIds.filter((id) => !allowed.has(id)));
    if (blocked.size) {
      categories = categories.filter((category) => !blocked.has(category.id));
      items = items.filter((item) => !item.category_id || !blocked.has(item.category_id));
    }
  }

  return { categories, items };
}


/** Lê primeiro o catálogo reutilizável; usa o espelho legado apenas como compatibilidade. */
export async function loadItemComplements(menuItemId: string): Promise<CatalogComplementGroup[]> {
  const { data: links, error: linksError } = await (supabase as any)
    .from("menu_item_complement_links")
    .select("group_id,sort_order,complement_groups(id,name,is_required,min_choices,max_choices,is_active)")
    .eq("menu_item_id", menuItemId)
    .order("sort_order");
  if (linksError) throw linksError;

  const activeLinks = (links ?? []).filter((link: any) => link.complement_groups?.is_active !== false);
  if (activeLinks.length > 0) {
    const groupIds = activeLinks.map((link: any) => link.group_id);
    const { data: options, error } = await (supabase as any)
      .from("complement_options")
      .select("id,group_id,name,extra_price,is_active,sort_order")
      .in("group_id", groupIds).eq("is_active", true).order("sort_order");
    if (error) throw error;
    const reusableGroups = activeLinks.map((link: any) => ({
      id: link.complement_groups.id,
      name: link.complement_groups.name,
      is_required: Boolean(link.complement_groups.is_required),
      min_choices: Number(link.complement_groups.min_choices ?? 0),
      max_choices: Math.max(1, Number(link.complement_groups.max_choices ?? 1)),
      options: (options ?? []).filter((option: any) => option.group_id === link.group_id)
        .map((option: any) => ({ id: option.id, name: option.name, extra_price: Number(option.extra_price ?? 0) })),
    }));

    // Alguns itens importados (principalmente bebidas) representam cada variação
    // como um grupo sem opções: “Normal”/“Zero”, “Com gás”/“Sem gás”, sabores etc.
    // Converte esse formato legado em uma escolha única sem alterar o cadastro.
    const groupsWithOptions = reusableGroups.filter((group) => group.options.length > 0);
    const emptyVariantGroups = reusableGroups.filter((group) => group.options.length === 0);
    if (groupsWithOptions.length === 0 && emptyVariantGroups.length > 1) {
      return [{
        id: `variant:${menuItemId}`,
        name: "Escolha uma opção",
        is_required: true,
        min_choices: 1,
        max_choices: 1,
        options: emptyVariantGroups.map((group) => ({
          id: group.id,
          name: group.name,
          extra_price: 0,
        })),
      }];
    }

    return groupsWithOptions;
  }

  const { data: legacyGroups, error: groupsError } = await supabase
    .from("menu_item_complement_groups")
    .select("id,name,is_required,min_choices,max_choices,sort_order")
    .eq("menu_item_id", menuItemId).order("sort_order");
  if (groupsError) throw groupsError;
  if (!legacyGroups?.length) return [];
  const { data: legacyOptions, error: optionsError } = await supabase
    .from("menu_item_complement_options")
    .select("id,group_id,name,extra_price,is_active,sort_order")
    .in("group_id", legacyGroups.map((group) => group.id)).eq("is_active", true).order("sort_order");
  if (optionsError) throw optionsError;
  return legacyGroups.map((group) => ({
    id: group.id,
    name: group.name,
    is_required: Boolean(group.is_required),
    min_choices: Number(group.min_choices ?? 0),
    max_choices: Math.max(1, Number(group.max_choices ?? 1)),
    options: (legacyOptions ?? []).filter((option) => option.group_id === group.id)
      .map((option) => ({ id: option.id, name: option.name, extra_price: Number(option.extra_price ?? 0) })),
  }));
}