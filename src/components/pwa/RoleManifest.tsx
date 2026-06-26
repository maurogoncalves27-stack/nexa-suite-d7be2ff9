import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type RoleManifestConfig = {
  manifest: string;
  themeColor: string;
  appleIcon: string;
};

const DEFAULT_CONFIG: RoleManifestConfig = {
  manifest: "/manifest.json",
  themeColor: "#ffffff",
  appleIcon: "/apple-touch-icon.png",
};

// Ordem importa: a primeira rota que casar (prefixo) define o manifest.
const ROLE_MAP: Array<{ prefix: string; config: RoleManifestConfig }> = [
  {
    prefix: "/parme",
    config: {
      manifest: "/manifest-parme.json",
      themeColor: "#b91c1c",
      appleIcon: "/icons/parme-512.png",
    },
  },
  {
    prefix: "/pedir",
    config: {
      manifest: "/manifest-pedir.json",
      themeColor: "#ea580c",
      appleIcon: "/icons/pedir-512.png",
    },
  },
  {
    prefix: "/painel-socio",
    config: {
      manifest: "/manifest-socio.json",
      themeColor: "#7c3aed",
      appleIcon: "/icons/nexa-socio-512.png",
    },
  },
  // Prefixos ampliados para cobrir também as telas de login/cadastro/aguardando,
  // que é onde o usuário normalmente instala a PWA. Sem isso, a instalação cai
  // no manifest default (NEXA) e o app aparece com nome/ícone do NEXA.
  {
    prefix: "/freelancer",
    config: {
      manifest: "/manifest-freelancer.json",
      themeColor: "#f97316",
      appleIcon: "/icons/nexa-freelancer-512.png",
    },
  },
  {
    prefix: "/nutricionista",
    config: {
      manifest: "/manifest-nutricionista.json",
      themeColor: "#16a34a",
      appleIcon: "/icons/nexa-nutri-512.png",
    },
  },
  {
    prefix: "/fornecedor",
    config: {
      manifest: "/manifest-fornecedor.json",
      themeColor: "#475569",
      appleIcon: "/icons/nexa-fornecedor-512.png",
    },
  },
  {
    prefix: "/parceiro",
    config: {
      manifest: "/manifest-fornecedor.json",
      themeColor: "#475569",
      appleIcon: "/icons/nexa-fornecedor-512.png",
    },
  },
  {
    prefix: "/consultor",
    config: {
      manifest: "/manifest-consultor.json",
      themeColor: "#0ea5e9",
      appleIcon: "/icons/nexa-consultor-512.png",
    },
  },
];

function resolveConfig(pathname: string): RoleManifestConfig {
  const match = ROLE_MAP.find((entry) => pathname.startsWith(entry.prefix));
  return match ? match.config : DEFAULT_CONFIG;
}

function setLinkHref(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (el.href !== window.location.origin + href && el.getAttribute("href") !== href) {
    el.setAttribute("href", href);
  }
}

function setMetaContent(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== content) {
    el.content = content;
  }
}

/**
 * Troca o manifest, theme-color e apple-touch-icon conforme a rota,
 * permitindo que cada perfil (sócio, freelancer, nutri, fornecedor)
 * instale um PWA dedicado com nome e ícone próprios.
 */
export function RoleManifest() {
  const { pathname } = useLocation();

  useEffect(() => {
    const cfg = resolveConfig(pathname);
    setLinkHref("manifest", cfg.manifest);
    setLinkHref("apple-touch-icon", cfg.appleIcon);
    setMetaContent("theme-color", cfg.themeColor);
  }, [pathname]);

  return null;
}
