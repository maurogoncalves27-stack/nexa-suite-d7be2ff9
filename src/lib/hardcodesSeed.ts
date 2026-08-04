// Inventário base de hardcodes do sistema.
// Fonte: varredura do código (docs/HARDCODES.md) — o status vive no banco (system_hardcodes).

export type HardcodePriority = "P0" | "P1" | "P2" | "P3";

export type HardcodeSeed = {
  code: string;
  area: string;
  file_path: string;
  description: string;
  priority: HardcodePriority;
  suggested_fix: string;
};

export const HARDCODE_AREAS = [
  "Agente TEF",
  "PayGo / pinpad",
  "Payer",
  "Totem / lojas",
  "Canais PDV",
  "Supabase / infra",
  "Domínios e URLs",
  "Listas de lojas",
  "Marcas / logos",
  "Fiscal / NFC-e",
  "Seeds e logins",
] as const;

export const HARDCODE_STATUSES = ["pendente", "em_andamento", "resolvido", "ignorado"] as const;
export type HardcodeStatus = (typeof HARDCODE_STATUSES)[number];

export const STATUS_LABELS: Record<HardcodeStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

export const PRIORITY_LABELS: Record<HardcodePriority, string> = {
  P0: "P0 · Bloqueia piloto",
  P1: "P1 · Multi-loja",
  P2: "P2 · Operação",
  P3: "P3 · Cosmético",
};

export const HARDCODES_SEED: HardcodeSeed[] = [
  // H1 — Agente TEF
  { code: "H1.01", area: "Agente TEF", file_path: "src/lib/tef/index.ts", description: 'agentUrl: "https://127.0.0.1:3031" no DEFAULT_CONFIG', priority: "P1", suggested_fix: "Sempre usar loadTefConfig(storeId); fallback apenas em desenvolvimento" },
  { code: "H1.02", area: "Agente TEF", file_path: "src/lib/tef/payer/client.ts", description: 'AGENT_URL fixo "https://127.0.0.1:3031"', priority: "P0", suggested_fix: "Receber agentUrl obrigatório vindo de pdv_tef_config" },
  { code: "H1.03", area: "Agente TEF", file_path: "src/components/tef-payer/PayerTestSaleCard.tsx", description: "URL do agente fixa no card de teste", priority: "P0", suggested_fix: "Prop agentUrl vinda da tela de setup" },
  { code: "H1.04", area: "Agente TEF", file_path: "src/pages/TefPayerSetup.tsx", description: "URL do agente fixa", priority: "P0", suggested_fix: "Ler pdv_tef_config da loja selecionada" },
  { code: "H1.05", area: "Agente TEF", file_path: "src/pages/TefPaygoSetup.tsx", description: "fallback https://127.0.0.1:3031", priority: "P0", suggested_fix: "Ler pdv_tef_config da loja selecionada" },
  { code: "H1.06", area: "Agente TEF", file_path: "src/components/tef-paygo/TefHomologationChecklist.tsx", description: "URL do agente fixa", priority: "P0", suggested_fix: "Prop agentUrl / config da loja" },
  { code: "H1.07", area: "Agente TEF", file_path: "src/components/pdv-novo/TefConfigPanel.tsx", description: "DEFAULT_AGENT_URL igual para todos os providers (3031)", priority: "P1", suggested_fix: "Template de URL por provider na própria UI" },
  { code: "H1.08", area: "Agente TEF", file_path: "src/pages/NfceTester.tsx", description: 'DEFAULT_URL = "https://127.0.0.1:3031"', priority: "P3", suggested_fix: "Campo salvo em localStorage" },
  { code: "H1.09", area: "Agente TEF", file_path: "electron-acbr/server.cjs", description: "portas 3030 / 3031 fixas", priority: "P2", suggested_fix: "ACBR_AGENT_PORT / ACBR_AGENT_HTTPS_PORT (já suportado por env)" },
  { code: "H1.10", area: "Agente TEF", file_path: "electron-acbr/main.cjs", description: "links de health 3030/3031", priority: "P3", suggested_fix: "Aceitável (uso local) — apenas documentar" },
  { code: "H1.11", area: "Agente TEF", file_path: "src/pages/TefPaygoSetup.tsx", description: "AGENT_EXE_URL com versão fixa do instalador", priority: "P1", suggested_fix: "Apontar para releases/latest.json ou variável de ambiente" },
  { code: "H1.12", area: "Agente TEF", file_path: "src/lib/tef/sitefAdapter.ts", description: "porta 3030 citada em comentário/doc", priority: "P3", suggested_fix: "Somente documentação" },

  // H2 — PayGo
  { code: "H2.01", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "PAYGO_CNPJ com default 44932369000108", priority: "P0", suggested_fix: "Env obrigatória em produção + UI de setup" },
  { code: "H2.02", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "PAYGO_PDC default 111476", priority: "P0", suggested_fix: "Env / pdv_tef_config.terminal_code" },
  { code: "H2.03", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "PAYGO_AMBIENTE default DEMO", priority: "P0", suggested_fix: "pdv_tef_config.environment" },
  { code: "H2.04", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "PAYGO_SENHA_TECNICA default 314159", priority: "P0", suggested_fix: "Secret em env; nunca default em produção" },
  { code: "H2.05", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: 'PAYGO_PINPAD_PORT default "5" (COM5)', priority: "P0", suggested_fix: "Configuração por totem (loja/dispositivo)" },
  { code: "H2.06", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: 'PAYGO_QR_DISPLAY_PREF default "2"', priority: "P1", suggested_fix: "pdv_tef_config ou settings do totem" },
  { code: "H2.07", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "caminho fixo C:\\Program Files (x86)\\PayGo\\...\\PGWebLib.dll", priority: "P2", suggested_fix: "PAYGO_DLL_PATH em env" },
  { code: "H2.08", area: "PayGo / pinpad", file_path: "src/pages/TefPaygoSetup.tsx", description: "DEFAULT_PDC, DEFAULT_HOST e DEFAULT_CNPJ fixos", priority: "P0", suggested_fix: "Colunas em pdv_tef_config ou settings da loja" },
  { code: "H2.09", area: "PayGo / pinpad", file_path: "src/pages/TefPaygoSetup.tsx", description: "host sandbox pos-transac-sb.tpgweb.io:31735", priority: "P0", suggested_fix: "Separar config demo x produção" },
  { code: "H2.10", area: "PayGo / pinpad", file_path: "src/components/tef-paygo/TefTestSaleCard.tsx", description: "adquirente default DEMO", priority: "P1", suggested_fix: "Seleção na UI + config da loja" },
  { code: "H2.11", area: "PayGo / pinpad", file_path: "src/components/tef-paygo/TefTestSaleCard.tsx", description: 'DEFAULT_SALE_ID = "VENDA-1001"', priority: "P3", suggested_fix: "Usar UUID / id real do pedido" },
  { code: "H2.12", area: "PayGo / pinpad", file_path: "src/components/tef-paygo/TefTestSaleCard.tsx", description: 'texto/badge fixo "ASA SUL"', priority: "P1", suggested_fix: "Derivar do storeId selecionado" },
  { code: "H2.13", area: "PayGo / pinpad", file_path: "src/components/tef-paygo/TefTestSaleCard.tsx", description: "consultas de log filtradas por Asa Sul", priority: "P1", suggested_fix: "Prop storeId" },
  { code: "H2.14", area: "PayGo / pinpad", file_path: "electron-acbr/acbr-tefd.cjs", description: "AUTCAP=388 (bit flags PayGo)", priority: "P2", suggested_fix: "Manter no código; apenas documentar (não é config de loja)" },

  // H3 — Payer
  { code: "H3.01", area: "Payer", file_path: "electron-acbr/payer-localhost.cjs", description: "PAYER_BASE_URL default http://127.0.0.1:6060", priority: "P0", suggested_fix: "Env no PC do totem (local é aceitável) — documentar" },
  { code: "H3.02", area: "Payer", file_path: "electron-acbr/payer-localhost.cjs", description: "PAYER_EMAIL / PAYER_PASSWORD vazios por padrão", priority: "P0", suggested_fix: "Env no PC do totem" },
  { code: "H3.03", area: "Payer", file_path: "src/pages/TefPayerSetup.tsx", description: "URL da documentação Payer fixa", priority: "P3", suggested_fix: "Constante de documentação" },
  { code: "H3.04", area: "Payer", file_path: "src/lib/tef/payer/client.ts", description: "funções com default de agent URL", priority: "P0", suggested_fix: "Ver H1.02" },
  { code: "H3.05", area: "Payer", file_path: "src/components/pdv-novo/TefConfigPanel.tsx", description: "provider payer selecionado por config", priority: "P0", suggested_fix: "Já resolvido via pdv_tef_config + UI" },

  // H4 — Totem / lojas
  { code: "H4.01", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: 'DEFAULT_TOTEM_STORE = "asa sul"', priority: "P0", suggested_fix: "Usar apenas user_metadata.totem_store" },
  { code: "H4.02", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "TOTEM_LOGIN_STORE_MAP (4 e-mails → loja)", priority: "P0", suggested_fix: "Remover; fonte única é o metadata do usuário" },
  { code: "H4.03", area: "Totem / lojas", file_path: "supabase/functions/seed-totem-logins/index.ts", description: "mesmos 4 e-mails/lojas duplicados", priority: "P1", suggested_fix: "Seed pontual; metadata como fonte canônica" },
  { code: "H4.04", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "logos importadas de @/assets/logo-*", priority: "P2", suggested_fix: "Usar totem_assets (já existe TotemConfig)" },
  { code: "H4.05", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "fotos de exemplo parme/box/estrogonofe", priority: "P2", suggested_fix: "Bucket totem_assets" },
  { code: "H4.06", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: 'resolveBrandLogo() com slug "parme"', priority: "P2", suggested_fix: "Assets no banco por marca" },
  { code: "H4.07", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "TOTEM_THEME_STYLE com cores da Parmê", priority: "P2", suggested_fix: "Tema por marca/loja" },
  { code: "H4.08", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "IDLE_TIMEOUT_MS = 60.000", priority: "P2", suggested_fix: "Configuração do totem" },
  { code: "H4.09", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: 'PHOTO_BUCKET = "menu-photos"', priority: "P3", suggested_fix: "Constante de infraestrutura" },
  { code: "H4.10", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: 'canal criado como "balcao"', priority: "P1", suggested_fix: "Ver H5.01 (canal totem)" },
  { code: "H4.11", area: "Totem / lojas", file_path: "src/lib/order/closeOrder.ts", description: 'canal "balcao" duplicado', priority: "P1", suggested_fix: "Ver H5.01" },
  { code: "H4.12", area: "Totem / lojas", file_path: "src/pages/Auth.tsx", description: "redirect do totem via flag totem_login", priority: "P2", suggested_fix: "Aceitável (flag de metadata)" },
  { code: "H4.13", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "código de retirada aleatório de 3 dígitos", priority: "P2", suggested_fix: "Sequência por loja/dia" },
  { code: "H4.14", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "observação Totem · Comer aqui / Para levar em texto fixo", priority: "P3", suggested_fix: "Template de texto" },
  { code: "H4.15", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: 'forma de pagamento sempre "credit"', priority: "P1", suggested_fix: "Mapear método/bandeira retornados pelo TEF" },
  { code: "H4.16", area: "Totem / lojas", file_path: "src/pages/Totem.tsx", description: "duplicação e-mail→loja entre app e seed", priority: "P0", suggested_fix: "Fonte única: metadata do auth" },
  { code: "H4.17", area: "Totem / lojas", file_path: "src/pages/TotemConfig.tsx", description: "bucket totem-backgrounds fixo", priority: "P3", suggested_fix: "Aceitável (infra)" },
  { code: "H4.18", area: "Totem / lojas", file_path: "docs/HOMOLOGACOES.md", description: "Asa Sul como default em toda a homologação", priority: "P2", suggested_fix: "Somente documentação" },

  // H5 — Canais PDV
  { code: "H5.01", area: "Canais PDV", file_path: "src/pages/Totem.tsx, src/lib/order/closeOrder.ts", description: 'code: "balcao" inserido automaticamente', priority: "P1", suggested_fix: "Canal totem por loja (seed em pdv_channels)" },
  { code: "H5.02", area: "Canais PDV", file_path: "src/pages/Totem.tsx", description: 'nome do canal "Balcão" fixo', priority: "P1", suggested_fix: "Cadastro em pdv_channels" },
  { code: "H5.03", area: "Canais PDV", file_path: "src/lib/order/closeOrder.ts", description: "sem canal whatsapp / garçom explícito", priority: "P2", suggested_fix: "Enum de canais + factory no closeOrder" },

  // H6 — Supabase / infra
  { code: "H6.01", area: "Supabase / infra", file_path: "src/integrations/supabase/client.ts", description: "URL e anon key com fallback embutido", priority: "P1", suggested_fix: "Somente variáveis de ambiente (arquivo é gerado automaticamente)" },
  { code: "H6.02", area: "Supabase / infra", file_path: "supabase/config.toml", description: "project_id fixo", priority: "P2", suggested_fix: "Gerenciado pela plataforma — não duplicar" },
  { code: "H6.03", area: "Supabase / infra", file_path: "src/integrations/supabase/types.ts", description: "arquivo gerado automaticamente", priority: "P3", suggested_fix: "Regerar após cada migration" },

  // H7 — Domínios e URLs
  { code: "H7.01", area: "Domínios e URLs", file_path: "electron/main.cjs", description: "URL de produção /loja fixa", priority: "P1", suggested_fix: "Variável de build do Electron" },
  { code: "H7.02", area: "Domínios e URLs", file_path: "src/pages/Recruitment.tsx", description: "PUBLIC_BASE com domínio fixo", priority: "P2", suggested_fix: "VITE_PUBLIC_SITE_URL" },
  { code: "H7.03", area: "Domínios e URLs", file_path: "src/pages/FreelancerJobs.tsx", description: "domínio público fixo", priority: "P2", suggested_fix: "VITE_PUBLIC_SITE_URL" },
  { code: "H7.04", area: "Domínios e URLs", file_path: "src/lib/documentVerification.ts", description: "domínio público fixo", priority: "P2", suggested_fix: "VITE_PUBLIC_SITE_URL" },
  { code: "H7.05", area: "Domínios e URLs", file_path: "supabase/functions/notify-user/index.ts", description: "fallback de PUBLIC_SITE_URL fixo", priority: "P2", suggested_fix: "Secret do backend" },
  { code: "H7.06", area: "Domínios e URLs", file_path: "supabase/functions/send-push-on-notification/index.ts", description: "fallback de domínio fixo", priority: "P2", suggested_fix: "Secret do backend" },
  { code: "H7.07", area: "Domínios e URLs", file_path: "supabase/functions/send-transactional-email/index.ts", description: "domínios de e-mail fixos", priority: "P2", suggested_fix: "Secrets de e-mail" },
  { code: "H7.08", area: "Domínios e URLs", file_path: "src/pages/Auth.tsx", description: "domínio citado em texto", priority: "P3", suggested_fix: "Texto/copy" },
  { code: "H7.09", area: "Domínios e URLs", file_path: "src/pages/PublicJobDetail.tsx", description: "favicon com domínio fixo", priority: "P3", suggested_fix: "Configuração de marca" },
  { code: "H7.10", area: "Domínios e URLs", file_path: "src/pages/TefPaygoSetup.tsx", description: "URL do release .exe fixa", priority: "P1", suggested_fix: "Ver H1.11" },
  { code: "H7.11", area: "Domínios e URLs", file_path: "electron-totem/main.cjs", description: "URL de produção do totem fixa", priority: "P1", suggested_fix: "Variável de build do Electron" },
  { code: "H7.12", area: "Domínios e URLs", file_path: "supabase/functions/checklist-expired-alerts/index.ts", description: "link do sistema fixo nas mensagens", priority: "P2", suggested_fix: "Secret PUBLIC_SITE_URL" },
  { code: "H7.13", area: "Domínios e URLs", file_path: "supabase/functions/process-late-punch-alerts/index.ts", description: "link do sistema fixo nas mensagens", priority: "P2", suggested_fix: "Secret PUBLIC_SITE_URL" },
  { code: "H7.14", area: "Domínios e URLs", file_path: "supabase/functions/notify-maintenance-request/index.ts", description: "link do sistema fixo (também em -resolved e -reopened)", priority: "P2", suggested_fix: "Secret PUBLIC_SITE_URL" },
  { code: "H7.15", area: "Domínios e URLs", file_path: "supabase/functions/whatsapp-customer-ai-reply/index.ts", description: "links públicos fixos nas respostas da Giana", priority: "P2", suggested_fix: "Secret PUBLIC_SITE_URL" },

  // H8 — Listas de lojas
  { code: "H8.01", area: "Listas de lojas", file_path: "src/pages/Menu.tsx", description: "STORE_NAMES com as 4 lojas", priority: "P1", suggested_fix: "Consultar tabela stores" },
  { code: "H8.02", area: "Listas de lojas", file_path: "src/pages/Garcom.tsx", description: "lista ALLOWED com as 4 lojas", priority: "P1", suggested_fix: "Consultar tabela stores + permissões" },
  { code: "H8.03", area: "Listas de lojas", file_path: "src/pages/SmartPos.tsx", description: "ALLOWED_STORE_NAMES", priority: "P1", suggested_fix: "Consultar tabela stores" },
  { code: "H8.04", area: "Listas de lojas", file_path: "src/components/nutricontrol/NutriStoreSelector.tsx", description: "lista fixa de lojas + CD", priority: "P1", suggested_fix: "Consultar tabela stores" },
  { code: "H8.05", area: "Listas de lojas", file_path: "src/components/finance/DreAllocatedPanel.tsx", description: "ALLOCATION_STORE_NAMES", priority: "P1", suggested_fix: "Consultar tabela stores" },
  { code: "H8.06", area: "Listas de lojas", file_path: "src/lib/scheduleRules.ts", description: 'cores por nome de loja ("asa sul", ...)', priority: "P2", suggested_fix: "Coluna de cor na tabela stores" },
  { code: "H8.07", area: "Listas de lojas", file_path: "supabase/functions/send-push-on-notification/index.ts", description: "mapa nome da loja → ícone", priority: "P2", suggested_fix: "Coluna de ícone na tabela stores" },
  { code: "H8.08", area: "Listas de lojas", file_path: "supabase/functions/notify-user/index.ts", description: "mapa nome da loja → ícone", priority: "P2", suggested_fix: "Coluna de ícone na tabela stores" },

  // H9 — Marcas / logos
  { code: "H9.01", area: "Marcas / logos", file_path: "src/pages/Totem.tsx", description: "imports PNG das 3 marcas", priority: "P2", suggested_fix: "Logos no banco (brands/totem_assets)" },
  { code: "H9.02", area: "Marcas / logos", file_path: "src/pages/Totem.tsx", description: "imports JPG de fundos de exemplo", priority: "P2", suggested_fix: "Upload em TotemConfig" },
  { code: "H9.03", area: "Marcas / logos", file_path: "src/pages/Totem.tsx", description: 'heurística if (nome.includes("parme"))', priority: "P2", suggested_fix: "Slug/asset por marca no banco" },
  { code: "H9.04", area: "Marcas / logos", file_path: "src/pages/Recipes.tsx", description: "HIDDEN_BRAND_SLUGS (totem/salão)", priority: "P2", suggested_fix: "Flag is_virtual/visível na tabela brands" },
  { code: "H9.05", area: "Marcas / logos", file_path: "src/pages/DailyAnalytics.tsx", description: "regex de canal /totem/", priority: "P3", suggested_fix: "Usar código de canal" },
  { code: "H9.06", area: "Marcas / logos", file_path: "src/assets", description: "caminhos de assets de marca fixos", priority: "P2", suggested_fix: "Storage + tabela brands" },

  // H10 — Fiscal
  { code: "H10.01", area: "Fiscal / NFC-e", file_path: "supabase/functions/nfce-emit/index.ts", description: "token Focus lido de secret (ok) com fallbacks fixos", priority: "P1", suggested_fix: "Somente secrets, sem fallback" },
  { code: "H10.02", area: "Fiscal / NFC-e", file_path: "src/lib/order/emitNfce.ts", description: "poll fixo de 6 tentativas a cada 1,5s", priority: "P2", suggested_fix: "Parâmetros de retry em configuração" },
  { code: "H10.03", area: "Fiscal / NFC-e", file_path: "src/pages/NfceTester.tsx", description: "escolha entre agente local e Focus fixa", priority: "P2", suggested_fix: "Documentar caminho duplo / seletor" },
  { code: "H10.04", area: "Fiscal / NFC-e", file_path: "supabase/functions/nfce-emit/index.ts", description: "dados fiscais (CNPJ/IE/CSC) por loja parcialmente fixos", priority: "P0", suggested_fix: "Tabela de configuração fiscal por loja" },

  // H11 — Seeds e logins
  { code: "H11.01", area: "Seeds e logins", file_path: "supabase/functions/seed-totem-logins/index.ts", description: "4 usuários de totem fixos", priority: "P2", suggested_fix: "Edge function admin-only com parâmetros" },
  { code: "H11.02", area: "Seeds e logins", file_path: "supabase/functions/seed-store-logins/index.ts", description: "4 logins de PC de loja fixos", priority: "P2", suggested_fix: "Edge function admin-only com parâmetros" },
];
