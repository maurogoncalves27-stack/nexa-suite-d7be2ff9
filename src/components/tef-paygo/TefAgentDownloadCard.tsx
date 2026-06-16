/**
 * Card de download do agente ACBr — instalador + portátil.
 * Tenta ler latest.json / latest-portable.json para pegar versão e nome do arquivo.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, HardDrive, Zap, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ReleaseInfo {
  version: string;
  file: string;
  releasedAt?: string;
  sha256?: string;
}

const FALLBACK_VERSION = "1.5.3";

function guessUrl(fileName: string) {
  // Tenta caminhos comuns onde o release pode estar servido
  const bases = ["/releases/", "./releases/", "/electron-acbr/releases/", "./electron-acbr/releases/"];
  return bases.map((b) => b + fileName);
}

async function fetchLatest(kind: "installer" | "portable"): Promise<ReleaseInfo | null> {
  const file = kind === "installer" ? "latest.json" : "latest-portable.json";
  const bases = ["/releases/", "./releases/", "/electron-acbr/releases/", "./electron-acbr/releases/"];
  for (const base of bases) {
    try {
      const res = await fetch(base + file, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (data.version && data.file) return data as ReleaseInfo;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function makeFallbackInfo(kind: "installer" | "portable"): ReleaseInfo {
  return {
    version: FALLBACK_VERSION,
    file:
      kind === "installer"
        ? `NEXA-ACBr-Agent-Setup-${FALLBACK_VERSION}.exe`
        : `NEXA-ACBr-Agent-Portable-${FALLBACK_VERSION}.exe`,
  };
}

function tryDownload(fileName: string) {
  const urls = guessUrl(fileName);
  // Tenta abrir o primeiro URL válido em nova aba / download
  const a = document.createElement("a");
  a.style.display = "none";
  document.body.appendChild(a);

  // Como não sabemos qual base funciona, tentamos sequencialmente com fetch HEAD
  const attempt = async (index: number) => {
    if (index >= urls.length) {
      document.body.removeChild(a);
      toast({
        title: "Arquivo não encontrado",
        description: `Não encontrei ${fileName} nos caminhos conhecidos. Verifique se o release foi buildado e copiado para electron-acbr/releases/.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(urls[index], { method: "HEAD", cache: "no-cache" });
      if (res.ok) {
        a.href = urls[index];
        a.download = fileName;
        a.click();
        document.body.removeChild(a);
        toast({ title: "Download iniciado", description: fileName });
        return;
      }
    } catch {
      /* ignore */
    }
    attempt(index + 1);
  };
  attempt(0);
}

export default function TefAgentDownloadCard() {
  const [installer, setInstaller] = useState<ReleaseInfo | null>(null);
  const [portable, setPortable] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [i, p] = await Promise.all([fetchLatest("installer"), fetchLatest("portable")]);
      if (!cancelled) {
        setInstaller(i ?? makeFallbackInfo("installer"));
        setPortable(p ?? makeFallbackInfo("portable"));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm">Download do Agente ACBr</h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <p className="text-xs text-muted-foreground">
        Escolha a versão que melhor se adapta ao PC do caixa.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Instalador */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Instalador</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {installer?.version ?? FALLBACK_VERSION}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Recomendado para a maioria dos PCs. Cria atalhos no menu Iniciar e na Área de Trabalho. Requer privilégios de administrador.
          </p>
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => tryDownload(installer?.file ?? makeFallbackInfo("installer").file)}
            disabled={loading}
          >
            <Download className="h-4 w-4" />
            Baixar instalador (.exe)
          </Button>
        </div>

        {/* Portátil */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium">Portátil</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {portable?.version ?? FALLBACK_VERSION}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Não precisa instalar. Basta copiar para uma pasta (ex.:{" "}
            <code className="text-[10px] bg-muted px-1 rounded">C:\NEXA\</code>
            ) e executar. Útil para testes rápidos ou PCs restritos.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-full gap-2"
            onClick={() => tryDownload(portable?.file ?? makeFallbackInfo("portable").file)}
            disabled={loading}
          >
            <Download className="h-4 w-4" />
            Baixar portátil (.exe)
          </Button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Arquivos gerados em{" "}
        <code className="text-[10px] bg-muted px-1 rounded">electron-acbr/releases/</code>.
        Se o download falhar, certifique-se de ter rodado{" "}
        <code className="text-[10px] bg-muted px-1 rounded">npm run release</code> ou{" "}
        <code className="text-[10px] bg-muted px-1 rounded">npm run release:portable</code> no
        projeto Electron.
      </div>
    </Card>
  );
}
