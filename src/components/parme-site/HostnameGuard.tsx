// Guard de hostname: quando o usuário acessa via aquelaparme.com.br ou
// www.aquelaparme.com.br, redireciona qualquer rota não-/parme/* para o
// equivalente sob /parme (ex.: "/" → "/parme", "/reservar" → "/parme/reservar").
// Em qualquer outro host (nexa.aquelaparme.com.br, *.lovable.app, localhost),
// passa direto — o app RH carrega normalmente.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SITE_HOSTS = new Set([
  "aquelaparme.com.br",
  "www.aquelaparme.com.br",
]);

const SITE_ALIASES: Record<string, string> = {
  "/": "/parme",
  "/aquela-parme": "/parme/aquela-parme",
  "/aquele-estrogonofe": "/parme/aquele-estrogonofe",
  "/box-caipira": "/parme/box-caipira",
  "/sobre": "/parme/sobre",
  "/reservar": "/parme/reservar",
  "/enderecos": "/parme/enderecos",
};

export function HostnameGuard() {
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!SITE_HOSTS.has(window.location.hostname)) return;
    if (loc.pathname.startsWith("/parme")) return;
    const target = SITE_ALIASES[loc.pathname];
    if (target) nav(target + loc.search + loc.hash, { replace: true });
  }, [loc, nav]);

  return null;
}
