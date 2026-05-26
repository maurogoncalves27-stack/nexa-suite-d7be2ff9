import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Sparkles, Upload, X, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nome completo",
  social_name: "Nome social",
  cpf: "CPF",
  rg: "RG",
  birth_date: "Data de nascimento",
  gender: "Sexo biológico",
  ethnicity: "Etnia",
  nationality: "Nacionalidade",
  marital_status: "Estado civil",
  spouse_name: "Cônjuge",
  father_name: "Nome do pai",
  mother_name: "Nome da mãe",
  birth_state: "UF de nascimento",
  education_level: "Escolaridade",
  nis_number: "PIS/NIS",
  voter_id: "Título de eleitor",
  voter_zone: "Zona eleitoral",
  voter_section: "Seção eleitoral",
  reservist_number: "Reservista",
  phone: "Telefone",
  email: "E-mail",
  address: "Endereço",
  zip_code: "CEP",
  city: "Cidade",
  state: "UF",
};

const DOC_TYPES = ["RG", "CPF", "CNH", "Comprovante de residência", "Carteira de trabalho", "Título de eleitor", "Outro"];

interface FileEntry {
  file: File;
  doc_type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (fields: Record<string, string>) => void;
  /**
   * Quando passado, o diálogo pula a etapa de upload manual e usa esses arquivos
   * diretamente (vindos do card "Documentos" da ficha). A extração é disparada
   * automaticamente assim que o diálogo abre.
   */
  prefilledFiles?: FileEntry[];
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function DocExtractDialog({ open, onOpenChange, onApply, prefilledFiles }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, string> | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{ name: string; url: string; isImage: boolean; doc_type: string }[]>([]);
  const autoTriggeredRef = useRef(false);

  const usingPrefilled = !!prefilledFiles && prefilledFiles.length > 0;

  // Gera object URLs dos arquivos (próprios ou pré-preenchidos) para preview
  useEffect(() => {
    const source = usingPrefilled ? prefilledFiles! : files;
    const urls = source.map((f) => ({
      name: f.file.name,
      url: URL.createObjectURL(f.file),
      isImage: f.file.type.startsWith("image/"),
      doc_type: f.doc_type,
    }));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u.url));
    };
  }, [files, prefilledFiles, usingPrefilled, open]);

  const reset = () => {
    setFiles([]);
    setExtracted(null);
    setSelected({});
    setErrorMsg(null);
    autoTriggeredRef.current = false;
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleAddFiles = (list: FileList | null) => {
    if (!list) return;
    const additions: FileEntry[] = [];
    for (const f of Array.from(list)) {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast({ title: "Formato inválido", description: `${f.name} não é JPG/PNG/PDF`, variant: "destructive" });
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: `${f.name} excede 8MB`, variant: "destructive" });
        continue;
      }
      additions.push({ file: f, doc_type: "RG" });
    }
    setFiles((prev) => [...prev, ...additions].slice(0, 6));
  };

  const runExtract = async (entries: FileEntry[]) => {
    if (entries.length === 0) {
      toast({ title: "Nenhum documento para extrair", variant: "destructive" });
      return;
    }
    setExtracting(true);
    setErrorMsg(null);
    try {
      const payloadFiles = await Promise.all(
        entries.map(async (f) => ({
          name: f.file.name,
          mime_type: f.file.type,
          data: await fileToBase64(f.file),
          doc_type: f.doc_type,
        })),
      );

      const { data, error } = await supabase.functions.invoke("extract-employee-doc", {
        body: { files: payloadFiles },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const fields = ((data as any)?.data ?? {}) as Record<string, string>;
      if (Object.keys(fields).length === 0) {
        setErrorMsg("Nenhum campo pôde ser extraído. Verifique a qualidade das imagens.");
      }
      setExtracted(fields);
      const sel: Record<string, boolean> = {};
      Object.keys(fields).forEach((k) => (sel[k] = true));
      setSelected(sel);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setErrorMsg(msg);
      toast({ title: "Falha na extração", description: msg, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const handleExtract = () => runExtract(files);

  // Auto-extrai quando o diálogo é aberto já com arquivos vindos do card "Documentos".
  useEffect(() => {
    if (open && usingPrefilled && !autoTriggeredRef.current && !extracted && !extracting) {
      autoTriggeredRef.current = true;
      runExtract(prefilledFiles!);
    }
    if (!open) {
      autoTriggeredRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usingPrefilled]);


  const handleApply = () => {
    if (!extracted) return;
    const toApply: Record<string, string> = {};
    for (const [k, v] of Object.entries(extracted)) {
      if (selected[k]) toApply[k] = v;
    }
    onApply(toApply);
    toast({ title: "Campos aplicados", description: `${Object.keys(toApply).length} campo(s) preenchido(s)` });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Preencher com documento
          </DialogTitle>
          <DialogDescription>
            {usingPrefilled
              ? <>Os documentos do card <em>"Documentos"</em> serão analisados pela IA para preencher automaticamente a ficha. Revise os campos extraídos antes de aplicar.</>
              : <>Envie fotos legíveis dos documentos <strong>somente para extração automática dos dados</strong>. Os arquivos enviados aqui não são salvos — o upload oficial dos documentos obrigatórios continua sendo feito na seção <em>"Documentos"</em> da ficha.</>}
          </DialogDescription>
        </DialogHeader>

        {!extracted && (
          <div className="space-y-4">
            {usingPrefilled ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {prefilledFiles!.length} documento(s) do card "Documentos" serão analisados:
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {prefilledFiles!.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded border p-2">
                      <span className="truncate">{f.file.name}</span>
                      <span className="text-xs">{f.doc_type}</span>
                    </li>
                  ))}
                </ul>
                {extracting && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando documentos com IA...
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="doc-files">Arquivos (JPG/PNG/PDF, até 8MB cada, máx. 6)</Label>
                  <Input
                    id="doc-files"
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={(e) => handleAddFiles(e.target.files)}
                    disabled={extracting || files.length >= 6}
                  />
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded border p-2">
                        <span className="flex-1 truncate text-sm">{f.file.name}</span>
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          value={f.doc_type}
                          onChange={(e) => {
                            const next = [...files];
                            next[idx] = { ...next[idx], doc_type: e.target.value };
                            setFiles(next);
                          }}
                          disabled={extracting}
                        >
                          {DOC_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                          disabled={extracting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {extracted && (
          <div className="space-y-3">
            {Object.keys(extracted).length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Nenhum campo identificado. Tente com imagens mais nítidas.</AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Compare o documento ao lado com os campos extraídos. Marque apenas os que deseja aplicar à ficha (campos já preenchidos serão sobrescritos).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Preview do(s) documento(s) */}
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Documento{previews.length > 1 ? "s" : ""}
                    </div>
                    {previews.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sem preview disponível.</p>
                    )}
                    {previews.map((p, i) => (
                      <div key={i} className="border rounded-md overflow-hidden bg-muted/30">
                        <div className="px-2 py-1 text-xs flex items-center justify-between bg-muted/50">
                          <span className="truncate">{p.name}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">{p.doc_type}</span>
                        </div>
                        {p.isImage ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={p.url}
                              alt={p.name}
                              className="w-full max-h-80 object-contain bg-background"
                            />
                          </a>
                        ) : (
                          <iframe
                            src={p.url}
                            title={p.name}
                            className="w-full h-80 bg-background"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Campos extraídos */}
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Campos extraídos pela IA
                    </div>
                    {Object.entries(extracted).map(([key, value]) => (
                      <label
                        key={key}
                        className="flex items-start gap-2 rounded border p-2 hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={!!selected[key]}
                          onCheckedChange={(v) => setSelected({ ...selected, [key]: !!v })}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">{FIELD_LABELS[key] ?? key}</div>
                          <div className="text-sm font-medium break-words">{String(value)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {!extracted ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={extracting}>
                Cancelar
              </Button>
              {usingPrefilled ? (
                errorMsg && !extracting ? (
                  <Button onClick={() => runExtract(prefilledFiles!)} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Tentar novamente
                  </Button>
                ) : null
              ) : (
                <Button onClick={handleExtract} disabled={extracting || files.length === 0} className="gap-2">
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {extracting ? "Extraindo..." : "Extrair dados"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setExtracted(null); setSelected({}); }}>
                Voltar
              </Button>
              <Button onClick={handleApply} disabled={Object.values(selected).every((v) => !v)} className="gap-2">
                <Upload className="h-4 w-4" />
                Aplicar à ficha
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
