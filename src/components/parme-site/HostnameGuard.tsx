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
  "/vagas": "/parme/vagas",
};

// Rotas que devem ir DIRETO para um arquivo estático em public/ — sem passar
// pelo React Router (evita flash de 404 e garante que o HTML real seja servido).
const STATIC_HTML_ROUTES: Record<string, string> = {
  "/surpresa": "/surpresa.html",
};

// Prefixos que também devem ser reescritos para /parme/* (rotas dinâmicas).
const SITE_PREFIX_ALIASES: Array<[string, string]> = [
  ["/vagas/", "/parme/vagas/"],
];

export function HostnameGuard() {
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;

    // PWA instalada (start_url contém ?source=pwa): sempre tratar como app NEXA,
    // independente do host. Se cair na raiz, manda pro fluxo de auth/restauração.
    const isPwaLaunch = new URLSearchParams(loc.search).get("source") === "pwa";

    // Modo NEXA: usuário entrou por aquelaparme.com.br/nexa — não reescrever para /parme
    let isNexaMode = false;
    try { isNexaMode = sessionStorage.getItem("nexa-app-mode") === "1"; } catch { /* ignore */ }

    // Subdomínios do app NEXA: nunca redirecionar para /parme.
    // Se cair em uma rota do site Parmê, manda pro /auth.
    if (host.startsWith("nexa.") || host.startsWith("nexasuite.")) {
      if (loc.pathname === "/" || loc.pathname.startsWith("/parme")) {
        nav("/auth", { replace: true });
      }
      return;
    }

    // Subdomínio do e-commerce: pedir.aquelaparme.com.br → /pedir/*
    if (host.startsWith("pedir.")) {
      if (!loc.pathname.startsWith("/pedir")) {
        const target = loc.pathname === "/" ? "/pedir" : "/pedir" + loc.pathname;
        nav(target + loc.search + loc.hash, { replace: true });
      }
      return;
    }

    // Rotas para arquivos estáticos em public/ — pular o SPA em qualquer host.
    const staticTarget = STATIC_HTML_ROUTES[loc.pathname];
    if (staticTarget) {
      window.location.replace(staticTarget + loc.search + loc.hash);
      return;
    }

    if (!SITE_HOSTS.has(host)) return;
    if (loc.pathname.startsWith("/parme")) return;
    if (loc.pathname === "/nexa") return; // atalho para o app NEXA — não reescrever
    if (isPwaLaunch || isNexaMode) return; // PWA instalada ou modo NEXA — não reescrever
    const target = SITE_ALIASES[loc.pathname];
    if (target) {
      nav(target + loc.search + loc.hash, { replace: true });
      return;
    }
    for (const [from, to] of SITE_PREFIX_ALIASES) {
      if (loc.pathname.startsWith(from)) {
        nav(to + loc.pathname.slice(from.length) + loc.search + loc.hash, { replace: true });
        return;
      }
    }
  }, [loc, nav]);

  return null;
}
