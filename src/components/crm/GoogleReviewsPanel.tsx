import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, RefreshCw, Search, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Store = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  google_place_id: string | null;
};

export function GoogleReviewsPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stores")
      .select("id,name,address,city,google_place_id")
      .eq("is_active", true)
      .eq("is_virtual", false)
      .order("name");
    if (error) toast.error("Falha ao carregar lojas");
    else setStores((data ?? []) as Store[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const savePlaceId = async (storeId: string) => {
    const value = (drafts[storeId] ?? "").trim() || null;
    setBusy(storeId);
    const { error } = await supabase
      .from("stores")
      .update({ google_place_id: value })
      .eq("id", storeId);
    setBusy(null);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Place ID salvo");
    setDrafts((d) => {
      const n = { ...d };
      delete n[storeId];
      return n;
    });
    load();
  };

  const detectAll = async () => {
    setBusy("__detect__");
    const { data, error } = await supabase.functions.invoke("google-reviews-sync", {
      body: { action: "detect" },
    });
    setBusy(null);
    if (error) return toast.error("Falha na detecção: " + error.message);
    const found = (data?.results ?? []).filter((r: any) => r.status === "detected").length;
    toast.success(`Detecção concluída — ${found} loja(s) atualizada(s)`);
    load();
  };

  const syncNow = async (storeId?: string) => {
    setBusy(storeId ?? "__sync__");
    const { data, error } = await supabase.functions.invoke("google-reviews-sync", {
      body: storeId ? { action: "sync", store_id: storeId } : { action: "sync" },
    });
    setBusy(null);
    if (error) return toast.error("Falha na sincronização: " + error.message);
    toast.success(`Sincronização OK — ${data?.total_upserted ?? 0} avaliação(ões) importada(s)`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Avaliações do Google
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Busca automática 1x/dia. Cada loja precisa do seu <b>Place ID</b>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={detectAll} disabled={busy !== null}>
            {busy === "__detect__" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1" />
            )}
            Detectar Place IDs
          </Button>
          <Button size="sm" onClick={() => syncNow()} disabled={busy !== null}>
            {busy === "__sync__" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Sincronizar agora
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          stores.map((s) => {
            const draft = drafts[s.id];
            const current = s.google_place_id ?? "";
            const value = draft ?? current;
            const dirty = draft !== undefined && draft !== current;
            return (
              <div
                key={s.id}
                className="flex flex-col md:flex-row md:items-center gap-2 border rounded-lg p-3"
              >
                <div className="min-w-[180px]">
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[s.address, s.city].filter(Boolean).join(", ") || "sem endereço"}
                  </div>
                  {s.google_place_id ? (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Sem Place ID
                    </Badge>
                  )}
                </div>
                <Input
                  className="flex-1 font-mono text-xs"
                  placeholder="ChIJ... (Google Place ID)"
                  value={value}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                  }
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!dirty || busy !== null}
                    onClick={() => savePlaceId(s.id)}
                  >
                    {busy === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!s.google_place_id || busy !== null}
                    onClick={() => syncNow(s.id)}
                    title="Sincronizar só essa loja"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
        <p className="text-xs text-muted-foreground pt-1">
          Encontre o Place ID em{" "}
          <a
            href="https://developers.google.com/maps/documentation/places/web-service/place-id"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            developers.google.com/.../place-id
          </a>
          . Ou clique em <b>Detectar Place IDs</b> para o sistema tentar sozinho pelo endereço.
        </p>
      </CardContent>
    </Card>
  );
}
