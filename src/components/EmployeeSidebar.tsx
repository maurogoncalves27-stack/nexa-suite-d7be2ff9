import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  FileText,
  ClipboardList,
  AlertTriangle,
  Star,
  PiggyBank,
  DollarSign,
  Package,
  LogOut,
  RefreshCw,
} from "lucide-react";

const items = [
  { title: "Início", url: "/area-colaborador", icon: Home },
  { title: "Meus holerites", url: "/meus-holerites", icon: FileText },
  { title: "Check-lists", url: "/checklists", icon: ClipboardList },
  { title: "Ocorrências", url: "/ocorrencias", icon: AlertTriangle },
  { title: "Avaliações de clientes", url: "/avaliacoes-clientes", icon: Star },
  { title: "Caixinha", url: "/caixinha", icon: PiggyBank },
  { title: "Faturamento", url: "/faturamento", icon: DollarSign },
  { title: "Estoque", url: "/estoque", icon: Package },
];

export function EmployeeSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin, isManager, isPartner, isSuperUser } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (url: string) =>
    url === "/area-colaborador" ? pathname === url : pathname.startsWith(url);

  const hasMultipleProfiles =
    isSuperUser || [isAdmin, isManager, isPartner].filter(Boolean).length > 0;

  return (
    <Sidebar
      collapsible="icon"
      className="dark:[--sidebar-background:222_20%_9%] dark:[--sidebar-foreground:210_20%_92%] dark:[--sidebar-primary:217_91%_55%] dark:[--sidebar-primary-foreground:0_0%_100%] dark:[--sidebar-accent:222_16%_16%] dark:[--sidebar-accent-foreground:0_0%_100%] dark:[--sidebar-border:222_15%_20%] dark:[--sidebar-ring:217_91%_60%] [--sidebar-background:222_22%_11%] [--sidebar-foreground:210_20%_92%] [--sidebar-primary:217_91%_55%] [--sidebar-primary-foreground:0_0%_100%] [--sidebar-accent:222_18%_18%] [--sidebar-accent-foreground:0_0%_100%] [--sidebar-border:222_15%_22%] [--sidebar-ring:217_91%_60%]"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Colaborador</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2 space-y-1">
        {hasMultipleProfiles && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/selecionar-acesso")}
            className="w-full justify-start"
          >
            <RefreshCw className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Trocar acesso</span>}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
