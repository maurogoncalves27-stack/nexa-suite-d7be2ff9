/**
 * Chaveamento de provider TEF (PayGo ⇄ Payer) no agente local.
 * O pinpad é exclusivo: só um provider pode manter a sessão aberta por vez.
 * Não altera o fluxo transacional homologado — apenas orquestra a posse.
 */
import { joinAgentUrl } from "./agentUrl";
import type { TefConfig } from "./types";

export type TefProvider = TefConfig["provider"];

export interface TefAgentHealth {
  ok: boolean;
  agent?: string;
  version?: string;
  port?: number;
  activeProvider?: TefProvider | null;
  switching?: boolean;
  providers?: {
    payer?: { installed: boolean; baseUrl?: string };
    paygo?: { installed: boolean; dllPath?: string | null };
  };
}

export const fetchTefAgentHealth = async (agentUrl: string): Promise<TefAgentHealth> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/health"), {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { ok: false };
    return (await r.json()) as TefAgentHealth;
  } catch {
    return { ok: false };
  }
};

export const getActiveTefProvider = async (
  agentUrl: string,
): Promise<{ ok: boolean; provider: TefProvider | null; switching?: boolean }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/active-provider"), {
      signal: AbortSignal.timeout(3000),
    });
    return await r.json();
  } catch {
    return { ok: false, provider: null };
  }
};

/**
 * Pede ao agente que o provider informado assuma o pinpad.
 * O agente encerra a sessão do provider anterior antes de assumir o novo.
 */
export const setActiveTefProvider = async (
  agentUrl: string,
  provider: TefProvider,
): Promise<{ ok: boolean; changed?: boolean; busy?: boolean; error?: string }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/active-provider"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
      signal: AbortSignal.timeout(15000),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Agente indisponível" };
  }
};

/** Libera o pinpad (nenhum provider ativo). */
export const releaseTefProvider = async (agentUrl: string): Promise<{ ok: boolean }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/release"), {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
    return await r.json();
  } catch {
    return { ok: false };
  }
};
