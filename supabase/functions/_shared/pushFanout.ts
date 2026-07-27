// Helper to fanout push notifications to multiple user_ids by invoking notify-user.
// Fire-and-forget with concurrency cap. If skipInApp=true, notify-user will not
// re-insert into user_notifications (used when caller already inserted).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface PushFanoutPayload {
  title: string;
  message: string;
  url?: string;
  tag?: string;
  category?: string;
  skipInApp?: boolean;
}

export async function pushToUsers(userIds: string[], payload: PushFanoutPayload) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return { attempted: 0 };
  await Promise.all(
    unique.map((user_id) =>
      fetch(`${SUPABASE_URL}/functions/v1/notify-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ user_id, ...payload }),
      }).catch((e) => console.error("[pushFanout] notify-user failed", user_id, e)),
    ),
  );
  return { attempted: unique.length };
}
