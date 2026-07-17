import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Users, CheckCircle2, ClipboardList, Calendar, AlertTriangle,
  Clock, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";

interface Group { id: string; name: string }
interface TemplateWithGroups {
  id: string;
  title: string;
  deadline_time: string | null;
  weekdays: number[] | null;
  is_active: boolean;
  template_access_groups: { group_id: string }[];
}
interface Submission {
  id: string;
  shift_date: string;
  submitted_at: string;
  notes: string | null;
  template_id: string;
  user_id: string;
  user_name?: string;
  checklist_templates: { title: string } | null;
  checklist_answers: {
    checked: boolean;
    observation: string | null;
    checklist_items: { label: string; is_priority: boolean } | null;
  }[];
}
interface UserInGroup { user_id: string; full_name: string }

// Um item é considerado completo quando marcado OU quando o colaborador
// preencheu uma observação justificando o não preenchimento.
const isAnswerComplete = (a: { checked: boolean; observation: string | null }) =>
  a.checked || (!!a.observation && a.observation.trim().length > 0);

export default function AdminDashboardPanel() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [templates, setTemplates] = useState<TemplateWithGroups[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [usersByGroup, setUsersByGroup] = useState<Record<string, UserInGroup[]>>({});
  const [templateItemCounts, setTemplateItemCounts] = useState<Record<string, number>>({});
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterGroup, setFilterGroup] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => { loadGroups(); loadTemplates(); loadTemplateItemCounts(); }, []);
  useEffect(() => { loadSubmissions(); }, [filterDate]);
  useEffect(() => { loadUsersByGroup(); }, [groups.length]);

  const loadGroups = async () => {
    const { data } = await supabase.from("access_groups").select("id, name").order("name");
    if (data) setGroups(data as Group[]);
  };
  const loadTemplates = async () => {
    const { data } = await supabase
      .from("checklist_templates")
      .select("id, title, deadline_time, weekdays, is_active, template_access_groups(group_id)")
      .eq("is_active", true)
      .order("title");
    if (data) setTemplates(data as unknown as TemplateWithGroups[]);
  };
  const loadTemplateItemCounts = async () => {
    const { data } = await supabase.from("checklist_items").select("template_id");
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((it: any) => { counts[it.template_id] = (counts[it.template_id] || 0) + 1; });
      setTemplateItemCounts(counts);
    }
  };
  const loadUsersByGroup = async () => {
    if (groups.length === 0) return;
    const { data } = await supabase.from("user_access_groups").select("group_id, user_id");
    if (!data) return;
    const userIds = [...new Set(data.map((d: any) => d.user_id))];
    if (userIds.length === 0) {
      setUsersByGroup({});
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles").select("user_id, full_name").in("user_id", userIds);
    const nameMap: Record<string, string> = {};
    if (profiles) profiles.forEach((p: any) => (nameMap[p.user_id] = p.full_name));
    const grouped: Record<string, UserInGroup[]> = {};
    for (const g of groups) grouped[g.id] = [];
    for (const row of data as any[]) {
      if (!grouped[row.group_id]) grouped[row.group_id] = [];
      grouped[row.group_id].push({ user_id: row.user_id, full_name: nameMap[row.user_id] || "(sem nome)" });
    }
    setUsersByGroup(grouped);
  };

  const loadSubmissions = async () => {
    const { data } = await supabase
      .from("checklist_submissions")
      .select(`id, shift_date, submitted_at, notes, template_id, user_id,
        checklist_templates(title),
        checklist_answers(checked, observation, checklist_items(label, is_priority))`)
      .eq("shift_date", filterDate)
      .order("submitted_at", { ascending: false });
    if (data) {
      const userIds = [...new Set(data.map((s: any) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name")
        .in("user_id", userIds.length > 0 ? userIds : ["__none__"]);
      const nameMap: Record<string, string> = {};
      if (profiles) profiles.forEach((p: any) => (nameMap[p.user_id] = p.full_name));
      setSubmissions(
        (data as unknown as Submission[]).map((s) => ({
          ...s,
          user_name: nameMap[s.user_id] || "(sem nome)",
        })),
      );
    }
  };

  const dayOfWeek = new Date(filterDate + "T12:00:00").getDay();
  const activeTemplatesForDay = useMemo(
    () => templates.filter((tp) => !tp.weekdays || tp.weekdays.length === 0 || tp.weekdays.includes(dayOfWeek)),
    [templates, dayOfWeek],
  );

  const groupStats = useMemo(() => {
    const filtered = filterGroup === "all" ? groups : groups.filter((g) => g.id === filterGroup);
    return filtered.map((group) => {
      const groupTemplates = activeTemplatesForDay.filter((tp) =>
        tp.template_access_groups.some((tag) => tag.group_id === group.id),
      );
      const groupUsers = usersByGroup[group.id] || [];
      const expected = groupTemplates.length * groupUsers.length;
      const tIds = new Set(groupTemplates.map((tp) => tp.id));
      const uIds = new Set(groupUsers.map((u) => u.user_id));
      const groupSubs = submissions.filter((s) => tIds.has(s.template_id) && uIds.has(s.user_id));
      const now = new Date();
      const isToday = filterDate === new Date().toISOString().split("T")[0];
      const expiredTemplates = groupTemplates.filter((tp) => {
        if (!tp.deadline_time || !isToday) return false;
        const [h, m] = tp.deadline_time.split(":").map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0); return now > d;
      });
      const missing: { user: UserInGroup; template: TemplateWithGroups; expired: boolean }[] = [];
      for (const tmpl of groupTemplates) {
        const isExp = expiredTemplates.some((e) => e.id === tmpl.id);
        for (const usr of groupUsers) {
          if (!groupSubs.some((s) => s.template_id === tmpl.id && s.user_id === usr.user_id)) {
            missing.push({ user: usr, template: tmpl, expired: isExp });
          }
        }
      }
      const incomplete = groupSubs.filter(
        (s) => s.checklist_answers.length > 0 && !s.checklist_answers.every(isAnswerComplete),
      );
      const completionRate = expected > 0 ? Math.round((groupSubs.length / expected) * 100) : 0;
      return {
        group, groupTemplates, groupUsers, groupSubs, expectedSubmissions: expected,
        missing, expiredMissing: missing.filter((m) => m.expired), incomplete, completionRate,
      };
    });
  }, [groups, filterGroup, activeTemplatesForDay, usersByGroup, submissions, filterDate]);

  const totalSubmissions = submissions.length;
  const totalExpectedItems = groupStats.reduce((sum, gs) => {
    let items = 0;
    for (const tmpl of gs.groupTemplates) {
      const c = templateItemCounts[tmpl.id] || 0;
      items += c * gs.groupUsers.length;
    }
    return sum + items;
  }, 0);
  const checkedItems = submissions.reduce(
    (sum, s) => sum + s.checklist_answers.filter(isAnswerComplete).length, 0,
  );
  const conformity = totalExpectedItems > 0 ? Math.round((checkedItems / totalExpectedItems) * 100) : 0;
  const totalExpiredMissing = groupStats.reduce((s, g) => s + g.expiredMissing.length, 0);
  const totalIncomplete = groupStats.reduce((s, g) => s + g.incomplete.length, 0);

  return (
    <div className="animate-fade-in">
      <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Painel de checklists</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <Card><CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:py-4">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold leading-tight">{totalSubmissions}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Enviados</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:py-4">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
          </div>
          <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold leading-tight">{conformity}%</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Conformidade</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:py-4">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
          </div>
          <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold leading-tight">{totalExpiredMissing}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Expirados</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:py-4">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
          </div>
          <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold leading-tight">{totalIncomplete}</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Incompletos</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 flex-1 sm:flex-none">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="flex-1 sm:w-auto" />
        </div>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Todos os grupos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 grid grid-cols-2 sm:flex h-auto w-full sm:w-auto gap-1">
          <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm">
            <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Visão geral
          </TabsTrigger>
          <TabsTrigger value="expired" className="gap-1 text-xs sm:text-sm">
            <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Expirados
            {totalExpiredMissing > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs">{totalExpiredMissing}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="incomplete" className="gap-1 text-xs sm:text-sm">
            <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Incompletos
            {totalIncomplete > 0 && (
              <Badge className="ml-1 h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs bg-warning text-warning-foreground">
                {totalIncomplete}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1 text-xs sm:text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Enviados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            {groupStats.map((gs) => (
              <Card key={gs.group.id}>
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />{gs.group.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {gs.groupUsers.length} colab. · {gs.groupTemplates.length} checklists ·
                        {" "}{gs.groupSubs.length}/{gs.expectedSubmissions} preenchidos
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{gs.completionRate}%</p>
                      <p className="text-xs text-muted-foreground">Conclusão</p>
                    </div>
                  </div>
                  <Progress value={gs.completionRate} className="mt-2 h-2" />
                </CardHeader>
                {(gs.expiredMissing.length > 0 || gs.incomplete.length > 0 || gs.missing.length > 0) && (
                  <CardContent className="pt-0 space-y-2">
                    {gs.expiredMissing.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <XCircle className="h-3.5 w-3.5" />{gs.expiredMissing.length} expirados sem preencher
                      </div>
                    )}
                    {gs.incomplete.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" />{gs.incomplete.length} com itens incompletos
                      </div>
                    )}
                    {gs.missing.filter((m) => !m.expired).length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {gs.missing.filter((m) => !m.expired).length} pendentes
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
            {groupStats.length === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                Nenhum grupo cadastrado.
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="expired">
          <div className="space-y-3">
            {groupStats.map((gs) => gs.expiredMissing.length > 0 ? (
              <Card key={gs.group.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4" />{gs.group.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {gs.expiredMissing.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border rounded-lg p-3">
                        <div>
                          <p className="font-medium">{m.user.full_name}</p>
                          <p className="text-xs text-muted-foreground">{m.template.title}</p>
                        </div>
                        <Badge variant="destructive" className="text-xs gap-1">
                          <Clock className="h-3 w-3" />{m.template.deadline_time?.slice(0, 5)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null)}
            {totalExpiredMissing === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                Nenhum checklist expirado.
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="incomplete">
          <div className="space-y-3">
            {groupStats.map((gs) => gs.incomplete.length > 0 ? (
              <Card key={gs.group.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-semibold text-warning flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />{gs.group.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {gs.incomplete.map((sub) => {
                      const checked = sub.checklist_answers.filter(isAnswerComplete).length;
                      const total = sub.checklist_answers.length;
                      const uncheckedPriority = sub.checklist_answers.filter(
                        (a) => !isAnswerComplete(a) && a.checklist_items?.is_priority,
                      );
                      return (
                        <div key={sub.id}
                          className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{sub.user_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {sub.checklist_templates?.title} · {new Date(sub.submitted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-warning text-warning-foreground text-xs">{checked}/{total}</Badge>
                              {uncheckedPriority.length > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {uncheckedPriority.length} prioritário
                                </Badge>
                              )}
                              {expandedId === sub.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </div>
                          {expandedId === sub.id && (
                            <div className="mt-3 space-y-1">
                              {sub.checklist_answers.filter((a) => !isAnswerComplete(a)).map((a, i) => (
                                <div key={i} className={`text-sm flex items-center gap-2 ${
                                  a.checklist_items?.is_priority ? "text-destructive font-semibold" : "text-muted-foreground"
                                }`}>
                                  <XCircle className="h-3 w-3" />{a.checklist_items?.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null)}
            {totalIncomplete === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                Tudo completo!
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="submissions">
          {submissions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Nenhum envio para esta data.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <Card key={sub.id} className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{sub.user_name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sub.checklist_templates?.title} · {new Date(sub.submitted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={
                          sub.checklist_answers.every((a) => a.checked)
                            ? "bg-success text-success-foreground"
                            : "bg-warning text-warning-foreground"
                        }>
                          {sub.checklist_answers.filter((a) => a.checked).length}/{sub.checklist_answers.length}
                        </Badge>
                        {expandedId === sub.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>
                  {expandedId === sub.id && (
                    <CardContent className="pt-0 space-y-2">
                      {sub.checklist_answers.map((ans, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={ans.checked ? "text-success" : "text-destructive"}>
                            {ans.checked ? "✓" : "✗"}
                          </span>
                          <div>
                            <span className={`font-medium ${
                              ans.checklist_items?.is_priority && !ans.checked ? "text-destructive" : ""
                            }`}>
                              {ans.checklist_items?.label}
                            </span>
                            {ans.observation && (
                              <p className="text-muted-foreground">{ans.observation}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {sub.notes && (
                        <div className="mt-3 p-3 rounded-lg bg-muted text-sm">
                          <strong>Observações:</strong> {sub.notes}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
