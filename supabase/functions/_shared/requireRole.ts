// Shared auth guard for edge functions.
// Verifies caller JWT and checks the user has at least one of the allowed roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface RoleCheckResult {
  ok: boolean;
  userId?: string;
  response?: Response;
}

export async function requireRole(
  req: Request,
  allowedRoles: string[],
  corsHeaders: Record<string, string>,
): Promise<RoleCheckResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const userRoles = (roles ?? []).map((r: any) => r.role);
  const hasRole = userRoles.some((r: string) => allowedRoles.includes(r));
  if (!hasRole) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, userId: userData.user.id };
}

// Verifies a shared cron secret header for scheduled functions
// that should not be reachable by end users.
export function requireCronSecret(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    // Secret not configured — fail closed
    return new Response(JSON.stringify({ error: "cron secret not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const xCron = req.headers.get("x-cron-secret") ?? "";
  if (token !== expected && xCron !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// Allows either a valid CRON_SECRET (header x-cron-secret) for scheduled
// invocations, OR a valid JWT with one of the allowed roles for manual
// triggers from the UI. Returns ok=true if either path succeeds.
export async function requireCronOrRole(
  req: Request,
  allowedRoles: string[],
  corsHeaders: Record<string, string>,
): Promise<RoleCheckResult> {
  const expected = Deno.env.get("CRON_SECRET");
  const xCron = req.headers.get("x-cron-secret") ?? "";
  if (expected && xCron && xCron === expected) {
    return { ok: true };
  }
  return await requireRole(req, allowedRoles, corsHeaders);
}

