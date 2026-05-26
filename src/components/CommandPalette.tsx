import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  LayoutDashboard, Users, GraduationCap, Award, Briefcase, CalendarClock,
  HeartHandshake, Plane, Shirt, Clock, FolderOpen, UserSearch, Settings, Megaphone,
  FileText, Stethoscope, ClipboardCheck, Gift, ReceiptText, Bus, ListChecks,
  FileSignature, Wrench, Package, ShoppingCart, DollarSign, Truck, TrendingUp,
  FileBarChart, Landmark, Lock, ChefHat, ScanText, Tags, Send, ShieldCheck,
  AlertTriangle, BookMarked, Plus, Sun, Moon, LogOut, Home, BookOpenCheck,
  PackageCheck, CalendarDays, ClipboardList, Boxes, BadgePercent, Coins,
  Scale, Building2, Siren, ScrollText, Archive, FolderLock,
} from "lucide-react";
import LabCoatIcon from "@/components/icons/LabCoatIcon";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  staffOnly?: boolean;
  keywords?: string;
};

// Catálogo único — fonte da verdade para o palette.
const NAV_ITEMS: Item[] = [
  // Início
  { title: "Área do Colaborador", url: "/area-colaborador", icon: Home, group: "Início", keywords: "home inicio" },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, group: "Início", staffOnly: true, keywords: "metricas indicadores" },

  // Pessoas
  { title: "Colaboradores", url: "/colaboradores", icon: Users, group: "Pessoas", staffOnly: true, keywords: "funcionarios cadastros equipe" },
  { title: "Recrutamento", url: "/recrutamento", icon: UserSearch, group: "Pessoas", staffOnly: true, keywords: "vagas candidatos selecao" },
  { title: "Estágio", url: "/estagio", icon: GraduationCap, group: "Pessoas", staffOnly: true, keywords: "estagiarios" },
  
  

  // Jornada
  { title: "Ponto", url: "/ponto", icon: Clock, group: "Jornada", staffOnly: true, keywords: "registro horas batida" },
  { title: "Escalas", url: "/escalas", icon: CalendarClock, group: "Jornada", staffOnly: true, keywords: "horarios turnos" },
  { title: "Férias", url: "/ferias", icon: Plane, group: "Jornada", staffOnly: true, keywords: "ferias descanso" },
  { title: "Atestados Médicos", url: "/atestados", icon: Stethoscope, group: "Jornada", staffOnly: true, keywords: "saude medico afastamento" },
  { title: "Uniformes", url: "/uniformes", icon: Shirt, group: "Jornada", staffOnly: true, keywords: "roupa entrega" },
  { title: "Tarefas", url: "/tarefas", icon: ListChecks, group: "Jornada", staffOnly: true },

  // Desempenho
  { title: "Avaliações", url: "/avaliacoes", icon: Award, group: "Desempenho", staffOnly: true, keywords: "performance review" },
  { title: "Clima", url: "/clima", icon: HeartHandshake, group: "Desempenho", staffOnly: true, keywords: "pesquisa satisfacao" },
  { title: "Infrações e Advertências", url: "/infracoes", icon: FileText, group: "Desempenho", staffOnly: true, keywords: "advertencia disciplinar" },
  { title: "Avisos e agenda", url: "/avisos", icon: Megaphone, group: "Desempenho", staffOnly: true, keywords: "comunicado anuncio compromisso" },
  { title: "Atribuições por cargo", url: "/atribuicoes", icon: FileText, group: "Desempenho", staffOnly: true, keywords: "responsabilidades cargo" },

  // Pagamentos
  { title: "Folha de pagamento", url: "/folha", icon: ReceiptText, group: "Pagamentos", staffOnly: true, keywords: "salario pagamento mensal" },
  { title: "Bonificações", url: "/bonificacoes", icon: BadgePercent, group: "Pagamentos", staffOnly: true },
  { title: "Gratificações", url: "/gratificacoes", icon: Gift, group: "Pagamentos", staffOnly: true },
  { title: "Bônus por cargo", url: "/bonus-cargo", icon: Coins, group: "Pagamentos", staffOnly: true },
  { title: "Vale Transporte", url: "/vale-transporte", icon: Bus, group: "Pagamentos", staffOnly: true, keywords: "vt transporte" },

  // Documentos
  { title: "Contratos", url: "/contratos", icon: ScrollText, group: "Documentos", staffOnly: true },
  { title: "Termos e circulares", url: "/documentos-personalizados", icon: FileSignature, group: "Documentos", staffOnly: true },
  
  { title: "Pasta do Colaborador", url: "/pasta-colaborador", icon: Archive, group: "Documentos", staffOnly: true },
  { title: "Cofre (logins e contatos)", url: "/cofre", icon: FolderLock, group: "Documentos", staffOnly: true, keywords: "senhas vault" },

  // Estoque
  { title: "Recebimento", url: "/recebimento", icon: PackageCheck, group: "Estoque", keywords: "nota fiscal entrada" },
  { title: "Transferências", url: "/transferencias", icon: Send, group: "Estoque", staffOnly: true },
  { title: "Solicitações de urgência", url: "/solicitacoes-fabrica", icon: AlertTriangle, group: "Estoque", keywords: "fabrica urgencia" },
  { title: "Plano semanal da fábrica", url: "/plano-fabrica", icon: CalendarDays, group: "Estoque", staffOnly: true },
  { title: "Checklist de separação", url: "/separacao", icon: ClipboardList, group: "Estoque", staffOnly: true },
  { title: "Saldo de estoque", url: "/estoque", icon: TrendingUp, group: "Estoque" },
  { title: "Contagem", url: "/inventario", icon: Boxes, group: "Estoque", keywords: "contagem inventário físico" },
  { title: "Lotes, validades e perdas", url: "/lotes", icon: CalendarClock, group: "Estoque", keywords: "validade vencimento perda" },
  { title: "Produtos", url: "/produtos", icon: Package, group: "Estoque", keywords: "itens cadastro" },
  { title: "Fichas técnicas", url: "/fichas-tecnicas", icon: ChefHat, group: "Estoque", keywords: "receita ficha" },
  { title: "Receituário", url: "/receituario", icon: BookMarked, group: "Estoque" },
  { title: "Garantias de equipamentos", url: "/garantias", icon: ShieldCheck, group: "Estoque" },
  { title: "Patrimônio", url: "/patrimonio", icon: Landmark, group: "Estoque", staffOnly: true, keywords: "mobiliario equipamentos utensilhos inventario ativo" },
  { title: "PDV", url: "/pdv-novo", icon: ReceiptText, group: "PDV", staffOnly: true, keywords: "pdv vendas balcao ifood" },
  { title: "Vendas (Saipos – arquivado)", url: "/pdv", icon: ReceiptText, group: "PDV", staffOnly: true, keywords: "saipos historico arquivo" },
  { title: "Cardápio", url: "/cardapio", icon: ScanText, group: "PDV", staffOnly: true },

  // Compras
  { title: "Sugestão de compra", url: "/sugestao-compra", icon: ShoppingCart, group: "Compras", staffOnly: true },
  { title: "Cotações", url: "/cotacoes", icon: Scale, group: "Compras", staffOnly: true },
  { title: "Fornecedores", url: "/fornecedores", icon: Truck, group: "Compras", staffOnly: true },

  // Financeiro
  { title: "Extrato / +pagtos", url: "/financeiro", icon: DollarSign, group: "Financeiro", staffOnly: true, keywords: "lancamentos" },
  { title: "DRE", url: "/financeiro/dre", icon: FileBarChart, group: "Financeiro", staffOnly: true, keywords: "demonstrativo resultado" },
  { title: "Conciliação bancária", url: "/conciliacao", icon: Landmark, group: "Financeiro", staffOnly: true },
  { title: "Contas bancárias", url: "/financeiro/contas", icon: Building2, group: "Financeiro", staffOnly: true },
  { title: "Categorias financeiras", url: "/financeiro/categorias", icon: Tags, group: "Financeiro", staffOnly: true },

  // Operação
  { title: "Check-lists operacionais", url: "/checklists-gerenciar", icon: ClipboardCheck, group: "Operação", staffOnly: true },
  { title: "Check-lists", url: "/checklists", icon: ClipboardCheck, group: "Operação" },
  { title: "NutriControle", url: "/nutricontrol", icon: LabCoatIcon, group: "Operação", staffOnly: true, keywords: "nutricionista controle" },
  { title: "Visita técnica", url: "/nutri-visita", icon: Stethoscope, group: "Operação", staffOnly: true },
  { title: "Relatórios NutriControle", url: "/nutri-relatorios", icon: FileBarChart, group: "Operação", staffOnly: true },
  { title: "Manutenções", url: "/nutricontrol?tab=manutencao", icon: Wrench, group: "Operação", staffOnly: true },
  { title: "Central de Ocorrências", url: "/ocorrencias", icon: Siren, group: "Operação", keywords: "incidentes problemas" },

  // Sistema
  { title: "Lojas", url: "/lojas", icon: Settings, group: "Sistema", staffOnly: true, keywords: "unidades filiais" },
  { title: "Configurações", url: "/configuracoes", icon: Settings, group: "Sistema", staffOnly: true },
  { title: "Acessos externos", url: "/configuracoes/acessos-externos", icon: Lock, group: "Sistema", staffOnly: true, keywords: "convite parceiros" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { isAdmin, isManager, signOut } = useAuth();
  const { mode, toggleMode } = useTheme();
  const isStaff = isAdmin || isManager;

  const items = useMemo(
    () => NAV_ITEMS.filter((i) => !i.staffOnly || isStaff),
    [isStaff],
  );

  // Agrupa por categoria preservando a ordem do catálogo.
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    // pequeno delay para o dialog fechar antes da navegação/ação
    setTimeout(fn, 50);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar página ou ação..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Ações rápidas">
          {isStaff && (
            <CommandItem
              value="cadastro manual novo colaborador cadastrar funcionario"
              onSelect={() => run(() => navigate("/colaboradores/novo"))}
            >
              <Plus className="mr-2" />
              Cadastro manual de colaborador
            </CommandItem>
          )}
          {isStaff && (
            <CommandItem
              value="visualizar como colaborador area"
              onSelect={() => run(() => navigate("/visualizar-colaborador"))}
            >
              <UserSearch className="mr-2" />
              Visualizar área de um colaborador
            </CommandItem>
          )}
          <CommandItem
            value="alternar tema claro escuro dark light"
            onSelect={() => run(() => toggleMode())}
          >
            {mode === "dark" ? <Sun className="mr-2" /> : <Moon className="mr-2" />}
            Alternar tema {mode === "dark" ? "claro" : "escuro"}
          </CommandItem>
          <CommandItem
            value="sair logout sign out"
            onSelect={() => run(() => signOut())}
          >
            <LogOut className="mr-2" />
            Sair
          </CommandItem>
        </CommandGroup>

        {grouped.map(([groupName, list], idx) => (
          <div key={groupName}>
            <CommandSeparator />
            <CommandGroup heading={groupName}>
              {list.map((item) => (
                <CommandItem
                  key={item.url + item.title}
                  value={`${item.title} ${item.group} ${item.keywords ?? ""}`}
                  onSelect={() => run(() => navigate(item.url))}
                >
                  <item.icon className="mr-2" />
                  <span>{item.title}</span>
                  <CommandShortcut className="opacity-60">{item.group}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Evento global usado para abrir o Command Palette de qualquer lugar do app
 * (ex.: FAB no mobile, item da sidebar). Mantém um ponto único de controle
 * sem precisar de Context/store.
 */
export const COMMAND_PALETTE_OPEN_EVENT = "command-palette:open";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}

/**
 * Hook que registra o atalho global Ctrl+K / Cmd+K e escuta o evento
 * `command-palette:open` para permitir abertura programática.
 * Retorna `[open, setOpen]` para uso em layout.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpenEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvt);
    };
  }, []);

  return [open, setOpen] as const;
}
