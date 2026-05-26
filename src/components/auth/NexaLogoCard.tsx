export function NexaLogoCard() {
  return (
    <div className="mb-6">
      <div
        className="w-full rounded-lg border border-border/50 bg-card/95 backdrop-blur-sm shadow-xl flex items-center justify-center px-6 py-6 overflow-hidden"
        style={{ filter: "drop-shadow(0 20px 25px hsl(var(--primary) / 0.15))" }}
      >
        <img src="/logo-nexa.png" alt="NEXA - Gestão Inteligente" className="h-28 w-auto object-contain" />
      </div>
    </div>
  );
}
