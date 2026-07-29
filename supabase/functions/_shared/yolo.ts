// Helpers compartilhados da integração Yolo Club.
// Modelo confirmado pelo dev da Yolo (29/07/2026):
//  - O token de integração é POR FILIAL (gerado no painel da Yolo por filial)
//  - O token vai no header (Authorization: Bearer <token>) junto com o CODE do usuário
//  - São 2 endpoints: validação (lê situação do código) e confirmação/ativação
//  - Já na validação enviamos "valor economizado" (desconto) e "total da comanda"
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
  branchId: string | null;
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
    .select('token, yolo_branch_id, enabled')
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

  const branchId =
    storeToken?.yolo_branch_id ??
    ((config.store_mapping as Record<string, string> | null)?.[storeId] ?? null);

  return { ctx: { config: config as YoloConfig, token, branchId } };
}

export function yoloHeaders(ctx: YoloContext, code: string): Record<string, string> {
  const headerName = ctx.config.code_header_name || 'x-yolo-code';
  return {
    'Authorization': `Bearer ${ctx.token}`,
    'Content-Type': 'application/json',
    [headerName]: code,
  };
}

export function yoloUrl(ctx: YoloContext, path: string): string {
  return `${ctx.config.base_url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
