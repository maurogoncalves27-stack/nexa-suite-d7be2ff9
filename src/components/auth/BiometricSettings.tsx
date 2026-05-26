import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Fingerprint, Camera, Loader2, Trash2, Plus, ScanFace, Shield } from "lucide-react";
import { isWebAuthnSupported, createPasskey } from "@/lib/webauthn";
import { loadFaceModels, detectFaceDescriptor, captureVideoFrame, averageDescriptors } from "@/lib/faceApi";
import { format } from "date-fns";

interface Passkey {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export default function BiometricSettings() {
  const { user, session } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [hasFace, setHasFace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrollingPasskey, setEnrollingPasskey] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [faceMode, setFaceMode] = useState<"idle" | "preparing" | "capturing">("idle");
  const [samplesTaken, setSamplesTaken] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const webAuthnOk = isWebAuthnSupported();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: pks }, { data: face }] = await Promise.all([
      supabase.from("user_passkeys").select("id, device_name, created_at, last_used_at").order("created_at", { ascending: false }),
      supabase.from("user_face_descriptors").select("id, is_active").eq("user_id", user.id).maybeSingle(),
    ]);
    setPasskeys((pks ?? []) as Passkey[]);
    setHasFace(!!face?.is_active);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const enrollPasskey = async () => {
    if (!webAuthnOk) {
      toast({ title: "Dispositivo não suporta", description: "Seu navegador/dispositivo não suporta Passkeys.", variant: "destructive" });
      return;
    }
    if (!session) return;
    setEnrollingPasskey(true);
    try {
      const { data: opts, error } = await supabase.functions.invoke("passkey-register-options", {
        body: { rpId: window.location.hostname },
      });
      if (error || !opts) throw new Error(error?.message ?? "Falha ao iniciar");

      const credential = await createPasskey(opts);

      const { error: vErr } = await supabase.functions.invoke("passkey-register-verify", {
        body: {
          credential,
          deviceName: deviceName.trim() || `${navigator.platform || "Dispositivo"}`,
          expectedChallenge: opts.challenge,
          expectedOrigin: window.location.origin,
        },
      });
      if (vErr) throw new Error(vErr.message);

      toast({ title: "Passkey cadastrada", description: "Você pode usar a biometria deste dispositivo para entrar." });
      setDeviceName("");
      load();
    } catch (e: any) {
      toast({ title: "Não foi possível cadastrar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setEnrollingPasskey(false);
    }
  };

  const removePasskey = async (id: string) => {
    if (!confirm("Remover esta passkey?")) return;
    const { error } = await supabase.from("user_passkeys").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removida" });
    load();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startFaceEnroll = async () => {
    setFaceMode("preparing");
    setSamplesTaken(0);
    try {
      await loadFaceModels();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFaceMode("capturing");

      const samples: Float32Array[] = [];
      const TARGET = 5;
      let attempts = 0;
      while (samples.length < TARGET && attempts < 30) {
        attempts++;
        await new Promise((r) => setTimeout(r, 300));
        if (!videoRef.current) break;
        const desc = await detectFaceDescriptor(videoRef.current).catch(() => null);
        if (desc) {
          samples.push(desc);
          setSamplesTaken(samples.length);
        }
      }
      if (samples.length < 3) throw new Error("Não consegui detectar seu rosto. Verifique a iluminação e tente novamente.");

      const avg = averageDescriptors(samples);

      // Foto de referência (opcional, salva no bucket público time-clock-photos não — vamos só salvar descritor)
      let photoPath: string | null = null;
      if (videoRef.current) {
        try {
          const blob = await captureVideoFrame(videoRef.current);
          const fileName = `${user!.id}/${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("time-clock-photos")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
          if (!upErr) photoPath = fileName;
        } catch { /* ignora */ }
      }

      const { error: dbErr } = await supabase
        .from("user_face_descriptors")
        .upsert({
          user_id: user!.id,
          descriptor: avg,
          sample_count: samples.length,
          photo_path: photoPath,
          is_active: true,
        }, { onConflict: "user_id" });

      if (dbErr) throw new Error(dbErr.message);
      toast({ title: "Rosto cadastrado", description: "Você pode entrar com reconhecimento facial." });
      load();
    } catch (e: any) {
      toast({ title: "Falha no cadastro facial", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      stopCamera();
      setFaceMode("idle");
    }
  };

  const removeFace = async () => {
    if (!confirm("Remover cadastro facial de login?")) return;
    const { error } = await supabase.from("user_face_descriptors").delete().eq("user_id", user!.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removido" });
    load();
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Fingerprint className="h-5 w-5 text-primary" />
            Biometria do dispositivo (Passkey)
          </CardTitle>
          <CardDescription>
            Use Face ID, Touch ID, digital do Android ou Windows Hello para entrar sem digitar senha. Cada dispositivo precisa cadastrar a própria passkey.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!webAuthnOk && (
            <p className="text-sm text-muted-foreground">Este navegador/dispositivo não suporta Passkeys.</p>
          )}
          {webAuthnOk && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Nome do dispositivo (opcional)"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
              <Button onClick={enrollPasskey} disabled={enrollingPasskey}>
                {enrollingPasskey ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Cadastrar este dispositivo
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dispositivo cadastrado.</p>
          ) : (
            <ul className="divide-y">
              {passkeys.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      {p.device_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Cadastrado em {format(new Date(p.created_at), "dd/MM/yyyy")}
                      {p.last_used_at && ` · Último uso: ${format(new Date(p.last_used_at), "dd/MM/yyyy HH:mm")}`}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removePasskey(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanFace className="h-5 w-5 text-primary" />
            Reconhecimento facial
          </CardTitle>
          <CardDescription>
            Cadastre seu rosto para entrar usando a câmera de qualquer dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {hasFace ? "Rosto cadastrado." : "Nenhum rosto cadastrado."}
              </span>
              {hasFace && <Badge variant="outline">Ativo</Badge>}
            </div>
            <div className="flex gap-2">
              {hasFace && (
                <Button variant="outline" size="sm" onClick={removeFace}>
                  <Trash2 className="h-4 w-4 mr-2 text-destructive" />Remover
                </Button>
              )}
              <Button onClick={startFaceEnroll} disabled={faceMode !== "idle"}>
                {faceMode !== "idle" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                {hasFace ? "Recadastrar" : "Cadastrar rosto"}
              </Button>
            </div>
          </div>

          {faceMode !== "idle" && (
            <div className="rounded-md border p-3 space-y-2">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded-md bg-muted" />
              <p className="text-sm text-muted-foreground">
                {faceMode === "preparing" ? "Preparando câmera..." : `Capturando amostras: ${samplesTaken}/5 — mantenha o rosto centralizado.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
