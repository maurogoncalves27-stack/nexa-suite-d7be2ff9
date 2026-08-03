// ============================================================
// Leitura da base de conhecimento da Giana direto do banco
// (giana_dishes / giana_faq / giana_stores) com cache curto.
//
// O knowledge.ts continua sendo o FALLBACK e a fonte imutável
// das regras canônicas (pesos da parmegiana). Aqui só entra o
// conteúdo EDITÁVEL pela UI de Configurações.
// ============================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  PRATOS,
  FAQ,
  INFO,
  type Prato,
  type MarcaKey,
  type TamanhoParmegiana,
} from "./knowledge.ts";

const CACHE_TTL_MS = 60_000;

export type DbStore = {
  id: string;
  nome: string;
  endereco: string | null;
  horario: string | null;
  tem_salao: boolean;
  aceita_retirada: boolean;
  observacao: string | null;
};

type CacheEntry<T> = { value: T; at: number };

export type DbBrand = {
  id: string;
  nome: string;
  slogan: string | null;
  descricao: string | null;
  historia: string | null;
};

let brandsCache: CacheEntry<DbBrand[]> | null = null;
let dishesCache: CacheEntry<Prato[]> | null = null;
let storesCache: CacheEntry<DbStore[]> | null = null;

function fresh<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry.value;
}

function client(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Marcas ativas com descrição/história editáveis pela UI. */
export async function getBrands(): Promise<DbBrand[]> {
  const cached = fresh(brandsCache);
  if (cached) return cached;
  try {
    const { data, error } = await client()
      .from("giana_brands")
      .select("id, nome, slogan, descricao, historia")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    const mapped = (data ?? []) as unknown as DbBrand[];
    brandsCache = { value: mapped, at: Date.now() };
    return mapped;
  } catch (e) {
    console.error("[giana-knowledge] getBrands fallback:", e);
    return [];
  }
}

/** Pratos ativos vindos do CARDÁPIO (view giana_menu_dishes); fallback hardcoded. */
export async function getDishes(): Promise<Prato[]> {
  const cached = fresh(dishesCache);
  if (cached) return cached;
  try {
    const { data, error } = await client()
      .from("giana_menu_dishes")
      .select("id, marca, nome, descricao, tamanhos, serves_people, total_weight_g, protein_weight_g")
      .order("sort_order");
    if (error) throw error;
    if (!data?.length) return PRATOS;
    const mapped: Prato[] = data.map((d: Record<string, unknown>) => {
      const tamanhos = Array.isArray(d.tamanhos)
        ? (d.tamanhos as TamanhoParmegiana[])
        : [];
      const extras: string[] = [];
      if (d.serves_people != null) extras.push(`Serve: ${d.serves_people} pessoa(s)`);
      if (d.total_weight_g != null) extras.push(`Peso total: ${d.total_weight_g}g`);
      if (d.protein_weight_g != null) extras.push(`Proteína: ${d.protein_weight_g}g`);
      return {
        id: String(d.id),
        marca: String(d.marca) as MarcaKey,
        nome: String(d.nome),
        descricao: extras.length
          ? `${String(d.descricao)} | ${extras.join(" | ")}`
          : String(d.descricao),
        ...(tamanhos.length ? { tamanhos } : {}),
      };
    });

    dishesCache = { value: mapped, at: Date.now() };
    return mapped;
  } catch (e) {
    console.error("[giana-knowledge] getDishes fallback:", e);
    return PRATOS;
  }
}

/** Lojas ativas do banco; cai para o INFO hardcoded se o banco falhar. */
export async function getStores(): Promise<DbStore[]> {
  const cached = fresh(storesCache);
  if (cached) return cached;
  try {
    const { data, error } = await client()
      .from("giana_stores")
      .select("id, nome, endereco, horario, tem_salao, aceita_retirada, observacao")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    if (!data?.length) return fallbackStores();
    const fallbackById = new Map(fallbackStores().map((store) => [store.id, store]));
    const mapped = (data as unknown as DbStore[]).map((store) => {
      const fallback = fallbackById.get(store.id);
      return {
        ...store,
        endereco: store.endereco?.trim() || fallback?.endereco || null,
        horario: store.horario?.trim() || fallback?.horario || null,
      };
    });
    storesCache = { value: mapped, at: Date.now() };
    return mapped;
  } catch (e) {
    console.error("[giana-knowledge] getStores fallback:", e);
    return fallbackStores();
  }
}

function fallbackStores(): DbStore[] {
  return Object.entries(INFO.lojas).map(([id, l]) => ({
    id,
    nome: l.nome,
    endereco: l.endereco,
    horario: l.horario,
    tem_salao: id === "asa-norte",
    aceita_retirada: true,
    observacao: null,
  }));
}

/**
 * Busca de prato tolerante a erro de digitação/acento via trigram no banco.
 * Só aceita match com score razoável — abaixo disso é "não encontrado", para
 * a Giana dizer que vai confirmar com a equipe em vez de chutar.
 */
export async function searchDish(termo: string): Promise<Prato | null> {
  try {
    const { data, error } = await client().rpc("giana_search_dish", {
      _termo: termo,
    });
    if (error) throw error;
    const top = (data as Array<Record<string, unknown>> | null)?.[0];
    if (!top) return null;
    const score = Number(top.score ?? 0);
    if (score < 0.35) return null;
    const tamanhos = Array.isArray(top.tamanhos)
      ? (top.tamanhos as TamanhoParmegiana[])
      : [];
    return {
      id: String(top.id),
      marca: String(top.marca) as MarcaKey,
      nome: String(top.nome),
      descricao: String(top.descricao),
      ...(tamanhos.length ? { tamanhos } : {}),
    };
  } catch (e) {
    console.error("[giana-knowledge] searchDish fallback:", e);
    return null;
  }
}

/** Busca de FAQ por termos + similaridade de título. */
export async function searchFaq(pergunta: string): Promise<string | null> {
  try {
    const { data, error } = await client().rpc("giana_search_faq", {
      _pergunta: pergunta,
    });
    if (error) throw error;
    const top = (data as Array<Record<string, unknown>> | null)?.[0];
    if (!top) return null;
    if (Number(top.score ?? 0) < 0.5) return null;
    return String(top.resposta);
  } catch (e) {
    console.error("[giana-knowledge] searchFaq fallback:", e);
    return null;
  }
}

/** Fallback local de FAQ (mesma lógica do knowledge.ts). */
export function localFaq(pergunta: string): string | null {
  const t = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const f of FAQ) {
    for (const termo of f.termos) if (t.includes(termo)) return f.resposta;
  }
  return null;
}

/** Invalida o cache (usado em testes). */
export function resetKnowledgeCache() {
  dishesCache = null;
  storesCache = null;
  brandsCache = null;
}
