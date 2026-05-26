/**
 * IDs dos logins fixos de PC de loja (balcão).
 * Esses usuários:
 *  - têm bypass de geofence (não dependem de GPS do PC)
 *  - não são deslogados por inatividade (ficam logados 24/7)
 *
 * Mantenha em sincronia com a edge function `seed-store-logins`.
 */
export const STORE_LOGIN_USER_IDS: ReadonlySet<string> = new Set([
  "5c7f28f9-fff9-478c-9898-129d4856cc74", // asasul@aquelaparme.com.br
  "4202a854-9d27-400d-9738-e1d77460dc5c", // asanorte@aquelaparme.com.br
  "73de109f-df94-482e-9bed-1e1f339b98bc", // aguasclaras@aquelaparme.com.br
  "3794d08e-0f5d-4138-b75e-a012c145bcb0", // lagosul@aquelaparme.com.br
]);

export const isStoreLoginId = (userId: string | null | undefined): boolean =>
  !!userId && STORE_LOGIN_USER_IDS.has(userId);
