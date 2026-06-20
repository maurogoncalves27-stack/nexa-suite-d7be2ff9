import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { SmoothScroll } from "@/components/parme/smooth-scroll";

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
