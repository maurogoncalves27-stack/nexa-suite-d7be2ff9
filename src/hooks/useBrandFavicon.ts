import { useEffect } from "react";

/**
 * Substitui temporariamente os favicons da página pelo favicon informado.
 * Ao desmontar, restaura os favicons originais.
 *
 * Uso: páginas públicas que precisam exibir a marca de outra empresa
 * (ex.: portal de vagas Aquela Parmê) sem afetar o restante do app.
 */
export function useBrandFavicon(faviconUrl: string) {
  useEffect(() => {
    if (!faviconUrl) return;

    const head = document.head;
    const originalIcons = Array.from(
      head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
    );

    // Guarda e remove os ícones originais
    const snapshots = originalIcons.map((el) => ({
      el,
      next: el.nextSibling,
    }));
    originalIcons.forEach((el) => el.remove());

    // Insere o novo favicon
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = faviconUrl;
    link.setAttribute("data-brand-favicon", "true");
    head.appendChild(link);

    return () => {
      link.remove();
      // Restaura os ícones originais na ordem
      snapshots.forEach(({ el, next }) => {
        if (next && next.parentNode === head) {
          head.insertBefore(el, next);
        } else {
          head.appendChild(el);
        }
      });
    };
  }, [faviconUrl]);
}
