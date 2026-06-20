import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

const ChatWidget = lazy(() =>
  import("./ChatWidget").then((m) => ({ default: m.ChatWidget }))
);

function DeferredChatWidget() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(id);
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
    <div className="parme-site flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <DeferredChatWidget />
    </div>
  );
}
