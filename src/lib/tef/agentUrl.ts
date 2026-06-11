export const normalizeAgentUrl = (agentUrl: string): string => {
  const trimmed = (agentUrl || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
};

export const joinAgentUrl = (agentUrl: string, endpoint: string): string => {
  const base = normalizeAgentUrl(agentUrl);
  const suffix = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${suffix}`;
};