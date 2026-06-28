// Runs before `vite dev` and `vite build`; writes public/sitemap.xml
// Sitemap focado no site público do Parmê (aquelaparme.com.br).
// O painel Nexa (nexa.aquelaparme.com.br / nexasuite.aquelaparme.com.br) é privado e não entra aqui.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://aquelaparme.com.br";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// HostnameGuard redireciona / → /parme em aquelaparme.com.br, então as URLs
// canônicas indexáveis são as raízes "/", "/sobre", etc. (sem o prefixo /parme).
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/aquela-parme", changefreq: "weekly", priority: "0.9" },
  { path: "/box-caipira", changefreq: "weekly", priority: "0.9" },
  { path: "/aquele-estrogonofe", changefreq: "weekly", priority: "0.9" },
  { path: "/sobre", changefreq: "monthly", priority: "0.7" },
  { path: "/reservar", changefreq: "monthly", priority: "0.8" },
  { path: "/enderecos", changefreq: "monthly", priority: "0.7" },
];

function generateSitemap(items: SitemapEntry[]) {
  const urls = items.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
