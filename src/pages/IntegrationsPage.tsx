import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, RefreshCw, CheckCircle2, XCircle, ExternalLink, ShieldAlert, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Integration = {
  id: string;
  name: string;
  category: string;
  description: string;
  secrets: string[]; // env var names
  docsUrl?: string;
  where?: string; // human hint of where to get it
  managed?: "connector" | "lovable"; // secrets managed elsewhere
};

const INTEGRATIONS: Integration[] = [
  // ─── IA / Lovable ───
  {
    id: "lovable-ai",
    name: "Lovable AI Gateway",
    category: "IA e Automação",
    description: "Provedor padrão de IA (Gemini/Claude) usado em análise de ocorrências, atestados, currículos e chat.",
    secrets: ["LOVABLE_API_KEY"],
    managed: "lovable",
    where: "Auto-provisionada pela Lovable. Rotação via suporte.",
  },
  // ─── Fiscal / NFC-e ───
  {
    id: "focus-nfe",
    name: "Focus NFe",
    category: "Fiscal",
    description: "Emissão de NFC-e no PDV (produção). Token único por empresa.",
    secrets: ["FOCUS_NFE_TOKEN_PROD"],
    docsUrl: "https://focusnfe.com.br",
    where: "Painel Focus NFe → Configurações → Token de acesso",
  },
  // ─── Pagamentos ───
  {
    id: "mercado-pago",
    name: "Mercado Pago",
    category: "Pagamentos",
    description: "Links de pagamento (Pix/cartão) e webhooks para pedidos e portais.",
    secrets: ["MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_PUBLIC_KEY", "MERCADO_PAGO_WEBHOOK_SECRET", "MERCADO_PAGO_PROD_WEBHOOK_SECRET"],
    docsUrl: "https://www.mercadopago.com.br/developers/panel",
    where: "Mercado Pago → Suas integrações → Credenciais",
  },
  // ─── iFood ───
  {
    id: "ifood",
    name: "iFood",
    category: "Delivery",
    description: "Integração de pedidos, polling e webhook do iFood.",
    secrets: ["IFOOD_CLIENT_ID", "IFOOD_CLIENT_SECRET", "IFOOD_WEBHOOK_SECRET"],
    docsUrl: "https://developer.ifood.com.br",
    where: "iFood Portal do Desenvolvedor → Meus Apps → Credenciais",
  },
  // ─── WhatsApp ───
  {
    id: "uazapi",
    name: "UAZAPI (WhatsApp interno)",
    category: "WhatsApp",
    description: "Canal interno de notificações WhatsApp (colaboradores, alertas, avisos).",
    secrets: ["UAZAPI_BASE_URL", "UAZAPI_INSTANCE_TOKEN", "UAZAPI_WEBHOOK_SECRET"],
    docsUrl: "https://uazapi.com",
    where: "Painel UAZAPI → Instância → Token",
  },
  {
    id: "zapi-interno",
    name: "Z-API (interno)",
    category: "WhatsApp",
    description: "Canal alternativo Z-API para notificações internas.",
    secrets: ["ZAPI_INSTANCE_ID", "ZAPI_TOKEN", "ZAPI_CLIENT_TOKEN"],
    docsUrl: "https://z-api.io",
    where: "Painel Z-API → Instância → Configurações",
  },
  {
    id: "zapi-cliente",
    name: "Z-API Cliente (SAC)",
    category: "WhatsApp",
    description: "Instância dedicada ao WhatsApp de atendimento ao cliente com IA.",
    secrets: ["ZAPI_CUSTOMER_INSTANCE_ID", "ZAPI_CUSTOMER_TOKEN", "ZAPI_CUSTOMER_CLIENT_TOKEN", "WHATSAPP_CUSTOMER_PILOT_STORE_ID"],
    docsUrl: "https://z-api.io",
    where: "Painel Z-API → Nova instância (SAC)",
  },
  // ─── Sensores IoT ───
  {
    id: "tuya",
    name: "Tuya Smart (sensores Wi-Fi)",
    category: "IoT / Sensores",
    description: "Sensores de temperatura Smart Life nas câmaras frias. Sincroniza a cada 5 min.",
    secrets: ["TUYA_ACCESS_ID", "TUYA_ACCESS_SECRET", "TUYA_DATA_CENTER"],
    docsUrl: "https://iot.tuya.com",
    where: "iot.tuya.com → Cloud → Development → seu projeto → Overview",
  },
  // ─── Reservas / Parme ───
  {
    id: "parme",
    name: "Parme (reservas)",
    category: "Reservas",
    description: "Integração de reservas do site parme.com.br.",
    secrets: ["PARME_CONSUMER_ID", "PARME_CONSUMER_SECRET"],
    where: "Painel Parme → API → Credenciais",
  },
  // ─── Push ───
  {
    id: "vapid",
    name: "Notificações Push (VAPID)",
    category: "Notificações",
    description: "Chaves VAPID para envio de push notifications ao PWA (app instalado).",
    secrets: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    where: "Geradas 1x pela equipe (openssl / web-push). Não rotacionar sem plano.",
  },
  // ─── Google ───
  {
    id: "google-maps",
    name: "Google Maps",
    category: "Google",
    description: "Geocoding, geofence de lojas, rastreamento e Places.",
    secrets: ["GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_BROWSER_KEY", "GOOGLE_MAPS_TRACKING_ID"],
    managed: "connector",
    where: "Gerenciado via Conector Google Maps (Configurações → Conectores)",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "Google",
    description: "Leitura de planilhas auxiliares.",
    secrets: ["GOOGLE_SHEETS_API_KEY"],
    managed: "connector",
    where: "Gerenciado via Conector Google (Configurações → Conectores)",
  },
  // ─── Infra ───
  {
    id: "totem-seed",
    name: "Totem — senha de provisionamento",
    category: "Infra",
    description: "Senha usada para criar contas de terminal em novos totens.",
    secrets: ["TOTEM_SEED_PASSWORD"],
    where: "Definida internamente. Rotacionar exige reprovisionar todos os totens.",
  },
  {
    id: "nexa-migration",
    name: "Migração NEXA (source ↔ destino)",
    category: "Infra",
    description: "Credenciais usadas em migrações pontuais entre bancos NEXA. Podem ser removidas quando não houver mais migração pendente.",
    secrets: ["NEXA_SUITE_URL", "NEXA_SUITE_SERVICE_ROLE_KEY", "SOURCE_NEXA_URL", "SOURCE_NEXA_SERVICE_ROLE_KEY"],
    where: "Uso interno — copiar do banco de origem.",
  },
];

const ALL_SECRET_NAMES = Array.from(new Set(INTEGRATIONS.flatMap((i) => i.secrets)));

export default function IntegrationsPage() {
  const { isSuperUser, isAdmin } = useAuth();
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const canView = isSuperUser || isAdmin;

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("secrets-status", {
      body: { names: ALL_SECRET_NAMES },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível verificar status das credenciais");
      return;
    }
    setStatus(data?.status ?? {});
  }

  useEffect(() => { if (canView) load(); }, [canView]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return INTEGRATIONS;
    return INTEGRATIONS.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      i.secrets.some((s) => s.toLowerCase().includes(q))
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Integration[]>();
    for (const i of filtered) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!canView) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Acesso restrito
        </h1>
        <p className="text-muted-foreground">Apenas administradores podem visualizar esta página.</p>
      </div>
    );
  }

  const totalConfigured = Object.values(status).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Integrações e credenciais
          </h1>
          <p className="text-muted-foreground">
            Catálogo de todas as APIs e serviços externos do sistema. Valores das chaves nunca são exibidos.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar integração ou secret…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {totalConfigured} / {ALL_SECRET_NAMES.length} secrets configurados
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 text-sm space-y-1">
          <p className="font-medium">Como editar uma credencial</p>
          <p className="text-muted-foreground">
            Por segurança, os valores só podem ser alterados pelo painel <strong>Cloud → Secrets</strong> do editor Lovable (ícone de nuvem no topo). Peça na conversa: <em>"atualizar secret NOME_DA_CHAVE"</em> e um formulário seguro será aberto.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-8">
        {grouped.map(([cat, items]) => (
          <div key={cat} className="space-y-3">
            <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">{cat}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {items.map((i) => {
                const configured = i.secrets.filter((s) => status[s]).length;
                const total = i.secrets.length;
                const allOk = configured === total;
                return (
                  <Card key={i.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          {i.name}
                          {i.managed === "connector" && (
                            <Badge variant="outline" className="text-xs">Conector</Badge>
                          )}
                          {i.managed === "lovable" && (
                            <Badge variant="outline" className="text-xs">Lovable</Badge>
                          )}
                        </CardTitle>
                        <Badge className={allOk ? "bg-success text-success-foreground" : configured > 0 ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground"}>
                          {configured}/{total}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{i.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-1">
                        {i.secrets.map((s) => (
                          <li key={s} className="flex items-center justify-between text-sm">
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">{s}</code>
                            {status[s] ? (
                              <span className="flex items-center gap-1 text-success text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive text-xs">
                                <XCircle className="h-3.5 w-3.5" /> ausente
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {i.where && (
                        <p className="text-xs text-muted-foreground border-t pt-2">
                          <span className="font-medium">Onde obter:</span> {i.where}
                        </p>
                      )}
                      {i.docsUrl && (
                        <a
                          href={i.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          Abrir painel <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
