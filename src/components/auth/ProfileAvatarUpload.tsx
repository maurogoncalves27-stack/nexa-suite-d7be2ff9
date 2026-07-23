import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Camera, Loader2, UserCircle, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  employeeId: string;
  hasAvatar: boolean;
  avatarUrl: string | null;
  fullName: string;
  onChanged: () => void;
}

const MAX_BYTES = 4 * 1024 * 1024;

export default function ProfileAvatarUpload({
  employeeId,
  hasAvatar,
  avatarUrl,
  fullName,
  onChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Imagem muito grande", description: "Máximo 4MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `avatars/${employeeId}/profile-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("time-clock-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("employees")
        .update({ avatar_path: path })
        .eq("id", employeeId);
      if (dbErr) throw dbErr;

      toast({ title: "Foto atualizada" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };


  const initials = (fullName ?? "").split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={busy}>
          <button
            type="button"
            className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 shrink-0"
            aria-label="Alterar foto de perfil"
          >
            <Avatar className="h-20 w-20 md:h-24 md:w-24 border-2 border-primary/40 shadow-md">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {avatarUrl ? initials : <UserCircle className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {busy ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {hasAvatar ? "Trocar foto" : "Adicionar foto"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
