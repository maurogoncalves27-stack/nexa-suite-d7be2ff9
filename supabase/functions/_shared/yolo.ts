// Helpers compartilhados da integração Yolo Club.
// Guia oficial: https://integracao.yoloclub.com.br (v1.0, 07/2026)
//  - Token de integração é POR FILIAL (gerado no painel da Yolo)
//  - Header de autenticação: "Token: <token_64_chars>"
//  - Pré-validação (não consome): GET /integracao/consultar-token?codigo=XXXXXX
//  - Consumo/validação: POST /integracao/validar-token { Codigo, Valor, Economizou }
//  - Não há endpoint de estorno na API oficial.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type YoloConfig = {
  id: string;
  base_url: string;
  partner_id: string | null;
  store_mapping: Record<string, string> | null;
  validate_path: string;
  confirm_path: string;
  code_header_name: string;
  enabled: boolean;
};

export type YoloContext = {
  config: YoloConfig;
  token: string;
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export type YoloContextError = { reason: string; message: string; status: number };

export async function loadYoloContext(
  supabase: SupabaseClient,
  storeId: string,
): Promise<{ ctx?: YoloContext; error?: YoloContextError }> {
  const { data: config } = await supabase
    .from('yolo_config')
    .select('*')
    .eq('enabled', true)
    .maybeSingle();

  if (!config) {
    return { error: { reason: 'integration_disabled', message: 'Integração Yolo desabilitada', status: 503 } };
  }

  const { data: storeToken } = await supabase
    .from('yolo_store_tokens')
    .select('token, enabled')
    .eq('store_id', storeId)
    .eq('enabled', true)
    .maybeSingle();

  const token = storeToken?.token ?? Deno.env.get('YOLO_API_KEY') ?? '';
  if (!token) {
    return {
      error: {
        reason: 'missing_store_token',
        message: 'Nenhum token Yolo configurado para esta loja',
        status: 500,
      },
    };
  }

  return { ctx: { config: config as YoloConfig, token } };
}

export function yoloHeaders(ctx: YoloContext): Record<string, string> {
  return {
    'Token': ctx.token,
    'Content-Type': 'application/json',
  };
}

export function yoloUrl(ctx: YoloContext, path: string): string {
  return `${ctx.config.base_url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function toYoloMoney(cents: number): string {
  const reais = Math.round(cents) / 100;
  return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
