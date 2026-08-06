// Token de avaliação da entrega — deriva do id do pedido, sem guardar estado.
// O cliente recebe o link por WhatsApp e avalia sem login; o token evita que
// alguém avalie pedidos alheios apenas variando o UUID.
const SECRET =
  Deno.env.get('DELIVERY_RATING_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TOKEN_LENGTH = 16;

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signRatingToken(orderId: string): Promise<string> {
  if (!SECRET) throw new Error('rating secret not configured');
  const hex = await hmacHex(`delivery-rating:${orderId}`);
  return hex.slice(0, TOKEN_LENGTH);
}

export async function verifyRatingToken(orderId: string, token: string): Promise<boolean> {
  if (!SECRET || !token) return false;
  const expected = await signRatingToken(orderId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function buildRatingUrl(origin: string, orderId: string): Promise<string> {
  const token = await signRatingToken(orderId);
  return `${origin}/pedir/avaliar/${orderId}?t=${token}`;
}
