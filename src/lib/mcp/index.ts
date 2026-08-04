import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

// O emissor OAuth precisa ser o host direto do backend, montado a partir do
// project ref (inlined pelo Vite no build), nunca a URL do proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nexa-suite",
  title: "NEXA SUITE",
  version: "0.2.0",
  instructions:
    "MCP server for NEXA Suite. Requires the caller to sign in as a NEXA Suite user; tools act with that user's permissions. Use `echo` to verify connectivity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool],
});
