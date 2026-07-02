/** Parse tolerante do retorno INI de NFE_Enviar (ACBrLib). */
export interface AcbrEnviarParsed {
  authorized: boolean;
  cStat?: string;
  xMotivo?: string;
  chave?: string;
  protocolo?: string;
  numero?: number;
  serie?: number;
  raw: string;
}

const parseIni = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith(";")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in out)) out[key] = value;
  }
  return out;
};

const pick = (obj: Record<string, string>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = obj[k.toLowerCase()];
    if (v) return v;
  }
  return undefined;
};

export function parseAcbrEnviarRetorno(raw: string): AcbrEnviarParsed {
  const fields = parseIni(raw ?? "");
  const cStat = pick(fields, "cstat", "stat");
  const authorized = cStat === "100";
  const chave = pick(fields, "chnfe", "chave", "chavenfe");
  const protocolo = pick(fields, "nprot", "protocolo");
  const numero = pick(fields, "nnf", "numero");
  const serie = pick(fields, "serie");

  return {
    authorized,
    cStat,
    xMotivo: pick(fields, "xmotivo", "motivo"),
    chave: chave?.replace(/\D/g, "").length === 44 ? chave.replace(/\D/g, "") : chave,
    protocolo,
    numero: numero ? Number(numero) : undefined,
    serie: serie ? Number(serie) : undefined,
    raw,
  };
}
