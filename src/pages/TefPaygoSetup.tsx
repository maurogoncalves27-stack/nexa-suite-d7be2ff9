/**
 * /configuracoes/tef-paygo
 * Guia operacional para instalar e ativar o PayGo Windows em modo DEMO,
 * seguindo o fluxo oficial Setis (paygodev — Kit v5.1.50.2).
 *
 * A instalação/ativação NÃO é feita por código nosso: o operador baixa
 * o kit, instala o PayGo Windows e ativa o modo DEMO pela UI do próprio
 * PayGo Windows (3 cliques no logo → digitar "demo" → informar CNPJ + PdC).
 * A partir daí, o nosso agente Electron usa a PGWebLib.dll apenas para
 * transações (sale/refund/admin/reprint).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Download, Check, ExternalLink, Usb, Info,
  MousePointerClick, KeyRound, ShieldCheck, Copy, Pencil, Save, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import TefTestSaleCard from "@/components/tef-paygo/TefTestSaleCard";
import TefPinpadSetupCard from "@/components/tef-paygo/TefPinpadSetupCard";

const KIT_URL =
  "https://setis.com.br/filevista/public/j563/paygodev/20260422-integracao-setuppaygowindows-v5-1-50-2.zip";
const DOCS_URL =
  "https://paygodev.readme.io/docs/kit-para-atualiza%C3%A7%C3%A3o-da-documenta%C3%A7%C3%A3o";
const JIRA_URL =
  "https://dev.proj.setis.com.br/servicedesk/customer/portal/16";

const DEFAULT_PDC = "111476";
const DEFAULT_HOST = "pos-transac-sb.tpgweb.io:31735";
const DEFAULT_CNPJ = "44.932.369/0001-08";

interface Store { id: string; name: string; }
interface TefRow {
  store_id: string;
  cnpj: string | null;
  pdc: string | null;
  host: string | null;
}

const copy = (v: string, label: string) => {
  navigator.clipboard.writeText(v).then(() => {
    toast({ title: "Copiado", description: `${label} copiado para a área de transferência.` });
  });
};

const Step = ({
  n, title, children,
}: { n: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-3">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
      {n}
    </div>
    <div className="flex-1 space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  </div>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5">
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-mono truncate">{value}</div>
    </div>
    <Button variant="ghost" size="sm" onClick={() => copy(value, label)} className="shrink-0">
      <Copy className="h-4 w-4" />
    </Button>
  </div>
);

const TefPaygoSetup = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [cfg, setCfg] = useState<TefRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id,name")
        .eq("is_virtual", false)
        .order("name");
      setStores((data ?? []) as Store[]);
    })();
  }, []);

  useEffect(() => {
    if (!storeId) { setCfg(null); return; }
    (async () => {
      const { data } = await supabase
        .from("pdv_tef_config")
        .select("store_id,merchant_code,terminal_code,agent_url")
        .eq("store_id", storeId)
        .maybeSingle();
      if (!data) { setCfg(null); return; }
      setCfg({
        store_id: data.store_id,
        cnpj: data.merchant_code,
        pdc: data.terminal_code,
        host: data.agent_url,
      });
    })();
  }, [storeId]);

  const cnpj = cfg?.cnpj || DEFAULT_CNPJ;
  const pdc = cfg?.pdc || DEFAULT_PDC;
  const host = cfg?.host || DEFAULT_HOST;

  const acquirers = useMemo(() => ([
    { name: "DEMO", desc: "Simula uma sub-adquirente." },
    { name: "REDE", desc: "Aceita apenas valores inteiros no sandbox (centavos = negada)." },
    { name: "PIX C6 BANK", desc: "Gera QrCode; aprovação automática após alguns segundos." },
  ]), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          TEF PayGo — Instalação e modo DEMO
        </h1>
        <p className="text-muted-foreground">
          Fluxo oficial Setis (PayGo Windows v5.1.50.2). A ativação é feita pela UI do PayGo Windows;
          o NEXA usa a PGWebLib.dll apenas para transações.
        </p>
      </div>

      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <div className="font-semibold">Antes de começar</div>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Use o <strong>cabo USB original</strong> do PIN-Pad — outros cabos podem causar falha.</li>
              <li>Aloque o PIN-Pad na <strong>porta COM de menor número possível</strong> (suportado até COM32).</li>
              <li>Faça este procedimento uma vez por máquina/loja.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Credenciais desta loja</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Esses valores são informativos — você vai digitá-los na tela do PayGo Windows.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Loja</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="h-fit">
            {cfg ? "Configuração encontrada" : "Usando valores padrão (sandbox)"}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 pt-2">
          <Field label="CNPJ" value={cnpj} />
          <Field label="Ponto de Captura (PdC)" value={pdc} />
          <Field label="Host (sandbox)" value={host} />
        </div>
      </Card>

      <TefPinpadSetupCard storeId={storeId} />

      <TefTestSaleCard />

      <Card className="p-4 sm:p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          Passo a passo
        </h2>

        <Step n={1} title="Baixar o kit oficial do PayGo Windows">
          <p>Versão 5.1.50.2 — disponível no portal de desenvolvedores Setis.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" className="gap-2">
              <a href={KIT_URL} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" /> Baixar kit (.zip)
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Abrir documentação Setis
              </a>
            </Button>
          </div>
        </Step>

        <Step n={2} title="Instalar o PayGo Windows">
          <p>
            Extraia o ZIP e execute <code className="px-1 py-0.5 rounded bg-muted">SetupPayGo_full_v5.1.47.2.exe</code>.
            Aceite o caminho padrão e conclua a instalação.
          </p>
        </Step>

        <Step n={3} title="Conectar o PIN-Pad">
          <p className="flex items-center gap-2"><Usb className="h-4 w-4" /> Conecte o PIN-Pad pelo cabo USB original antes de seguir.</p>
        </Step>

        <Step n={4} title="Ativar o modo DEMO (sandbox)">
          <p className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4" />
            Abra o PayGo Windows e <strong>clique 3 vezes com o botão direito</strong> no logo do app.
          </p>
          <p>
            Uma caixa de diálogo abre — digite <code className="px-1 py-0.5 rounded bg-muted">demo</code> (sem aspas) e clique em <strong>OK</strong>.
            A interface fica <strong>roxa</strong>, indicando que o modo DEMO está ativo.
          </p>
        </Step>

        <Step n={5} title="Entrar no modo instalação da DLL">
          <p>Com o app já em modo DEMO, habilite o botão de <strong>"instalação da DLL"</strong> (destacado na documentação Setis).</p>
        </Step>

        <Step n={6} title="Informar CNPJ + Ponto de Captura e ATIVAR">
          <p className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Cole o <strong>CNPJ</strong> e o <strong>PdC</strong> mostrados acima e clique em <strong>ATIVAR</strong>.
          </p>
          <p>Pronto — a PGWebLib.dll já está pareada com a Setis e pode receber transações do NEXA.</p>
        </Step>

        <Step n={7} title="Validar com uma venda de teste">
          <p>Abra o PDV NEXA, faça uma venda de R$ 1,00 no cartão de crédito (adquirente DEMO ou REDE). Se o pinpad responder, está OK.</p>
        </Step>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Adquirentes disponíveis no sandbox
        </h2>
        <ul className="space-y-2 text-sm">
          {acquirers.map(a => (
            <li key={a.name} className="flex gap-2">
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{a.name}</span>
                <span className="text-muted-foreground"> — {a.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Suporte Setis</h2>
        <p className="text-sm text-muted-foreground">
          Solicitações de integração e suporte ao desenvolvedor são feitas pelo Jira da Setis.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-2 w-fit">
          <a href={JIRA_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> Abrir portal Setis
          </a>
        </Button>
      </Card>
    </div>
  );
};

export default TefPaygoSetup;
