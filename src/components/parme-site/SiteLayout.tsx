import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { SmoothScroll } from "@/components/parme/smooth-scroll";
import parmeIconAsset from "@/assets/parme/cropped-Icon-Aquela-parme-1.webp.asset.json";

const PARME_DESCRIPTION =
  "Aquela Parmê — parmegiana, comida caipira e estrogonofe em Brasília. Peça pelo iFood, WhatsApp ou reserve sua mesa.";

function useParmeHead() {
  useEffect(() => {
    const iconUrl = parmeIconAsset.url;
    const restorers: Array<() => void> = [];

    const swapMeta = (selector: string, value: string, create?: () => HTMLMetaElement) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el && create) {
        el = create();
        document.head.appendChild(el);
        restorers.push(() => el!.remove());
      }
      if (!el) return;
      const old = el.getAttribute("content");
      el.setAttribute("content", value);
      restorers.push(() => {
        if (old !== null) el!.setAttribute("content", old);
      });
    };

    const oldTitle = document.title;
    document.title = "Aquela Parmê — comida com gosto de casa em Brasília";
    restorers.push(() => { document.title = oldTitle; });

    swapMeta('meta[name="description"]', PARME_DESCRIPTION);
    swapMeta('meta[property="og:title"]', "Aquela Parmê");
    swapMeta('meta[property="og:description"]', PARME_DESCRIPTION);
    swapMeta('meta[name="twitter:title"]', "Aquela Parmê");
    swapMeta('meta[name="twitter:description"]', PARME_DESCRIPTION);
    swapMeta('meta[name="application-name"]', "Aquela Parmê");
    swapMeta('meta[name="apple-mobile-web-app-title"]', "Aquela Parmê");
    swapMeta('meta[property="og:site_name"]', "Aquela Parmê", () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:site_name");
      return m;
    });

    const iconLinks = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(
        'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]'
      )
    );
    iconLinks.forEach((link) => {
      const oldHref = link.getAttribute("href");
      const oldType = link.getAttribute("type");
      link.setAttribute("href", iconUrl);
      link.setAttribute("type", "image/webp");
      restorers.push(() => {
        if (oldHref !== null) link.setAttribute("href", oldHref);
        if (oldType !== null) link.setAttribute("type", oldType);
        else link.removeAttribute("type");
      });
    });

    return () => { restorers.reverse().forEach((fn) => fn()); };
  }, []);
}

const ChatWidget = lazy(() =>
  import("./ChatWidget").then((m) => ({ default: m.ChatWidget }))
);

function DeferredChatWidget() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    const cb = () => setReady(true);
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(cb, { timeout: 3000 });
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancel?.(id);
      };
    }
    const t = window.setTimeout(cb, 2500);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  useParmeHead();
  return (
    <SmoothScroll>
      <div className="parme-site flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <DeferredChatWidget />
      </div>
    </SmoothScroll>
  );
}
