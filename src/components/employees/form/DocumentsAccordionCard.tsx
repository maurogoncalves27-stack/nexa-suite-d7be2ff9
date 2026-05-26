import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, FileText, FolderArchive, Loader2, Sparkles, Trash2 } from "lucide-react";

export interface DocItem {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
}

export interface PendingDoc {
  tempId: string;
  doc_type: string;
  file: File;
}

export default function DocumentsAccordionCard({
  pendingDocs,
  documents,
  onRemovePending,
  onDownload,
  onDelete,
  onAutofillPending,
  onAutofillUploaded,
  autofillingKey,
}: {
  pendingDocs: PendingDoc[];
  documents: DocItem[];
  onRemovePending: (tempId: string) => void;
  onDownload: (doc: DocItem) => void;
  onDelete: (doc: DocItem) => void;
  onAutofillPending?: (p: PendingDoc) => void;
  onAutofillUploaded?: (d: DocItem) => void;
  autofillingKey?: string | null;
}) {
  if (pendingDocs.length === 0 && documents.length === 0) return null;

  const isExtractable = (name: string, mime?: string) => {
    const lower = name.toLowerCase();
    return (mime?.startsWith("image/") ?? false) ||
      mime === "application/pdf" ||
      /\.(jpe?g|png|webp|pdf)$/i.test(lower);
  };

  return (
    <Card>
      <Accordion type="single" collapsible>
        <AccordionItem value="docs" className="border-0">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FolderArchive className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">
                Documentos ({pendingDocs.length + documents.length})
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-2">
              {pendingDocs.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Pendentes (serão enviados ao salvar)
                  </div>
                  {pendingDocs.map((p) => {
                    const canExtract = isExtractable(p.file.name, p.file.type);
                    const busy = autofillingKey === `pending:${p.tempId}`;
                    return (
                      <div key={p.tempId} className="flex items-center gap-3 p-3 border border-dashed rounded-lg bg-muted/20">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.file.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.doc_type} · {(p.file.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        {onAutofillPending && canExtract && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1 h-8"
                            onClick={() => onAutofillPending(p)}
                            disabled={!!autofillingKey}
                            title="Preencher ficha com IA a partir deste documento"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            <span className="hidden sm:inline">Autopreencher</span>
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" onClick={() => onRemovePending(p.tempId)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
              {documents.length > 0 && (
                <>
                  {pendingDocs.length > 0 && (
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Já enviados
                    </div>
                  )}
                  {documents.map((d) => {
                    const canExtract = isExtractable(d.file_name);
                    const busy = autofillingKey === `doc:${d.id}`;
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{d.file_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.doc_type} · {new Date(d.uploaded_at).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                        {onAutofillUploaded && canExtract && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1 h-8"
                            onClick={() => onAutofillUploaded(d)}
                            disabled={!!autofillingKey}
                            title="Preencher ficha com IA a partir deste documento"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            <span className="hidden sm:inline">Autopreencher</span>
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" onClick={() => onDownload(d)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(d)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}