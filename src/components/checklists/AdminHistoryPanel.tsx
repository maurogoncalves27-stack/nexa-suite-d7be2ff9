import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ChevronDown, ChevronUp, Search } from "lucide-react";

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
interface Group { id: string; name: string }

export default function AdminHistoryPanel() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [filterGroup, setFilterGroup] = useState("all");
  const [searchUser, setSearchUser] = useState("");
  const [userIdsInGroup, setUserIdsInGroup] = useState<Set<string> | null>(null);

  useEffect(() => {
    supabase.from("access_groups").select("id, name").order("name")
      .then(({ data }) => { if (data) setGroups(data as Group[]); });
  }, []);

  useEffect(() => { loadSubmissions(); }, [dateFrom, dateTo]);

  useEffect(() => {
    if (filterGroup === "all") { setUserIdsInGroup(null); return; }
    supabase.from("user_access_groups").select("user_id").eq("group_id", filterGroup)
      .then(({ data }) => { if (data) setUserIdsInGroup(new Set(data.map((d: any) => d.user_id))); });
  }, [filterGroup]);

  const loadSubmissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("checklist_submissions")
      .select(`id, shift_date, submitted_at, notes, template_id, user_id,
        checklist_templates(title),
        checklist_answers(checked, observation, checklist_items(label, is_priority))`)
      .gte("shift_date", dateFrom).lte("shift_date", dateTo)
      .order("shift_date", { ascending: false })
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
          ...s, user_name: nameMap[s.user_id] || "(sem nome)",
        })),
      );
    }
    setLoading(false);
  };

  const filtered = submissions.filter((s) => {
    if (userIdsInGroup && !userIdsInGroup.has(s.user_id)) return false;
    if (searchUser && !s.user_name?.toLowerCase().includes(searchUser.toLowerCase())) return false;
    return true;
  });

  const byDate: Record<string, Submission[]> = {};
  for (const s of filtered) {
    if (!byDate[s.shift_date]) byDate[s.shift_date] = [];
    byDate[s.shift_date].push(s);
  }
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold mb-6">Histórico</h2>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
        </div>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os grupos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)} className="w-[200px]" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum resultado para os filtros aplicados.
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
                  weekday: "long", day: "2-digit", month: "long", year: "numeric",
                })}
                <Badge variant="secondary" className="ml-1">{byDate[date].length}</Badge>
              </h3>
              <div className="space-y-2">
                {byDate[date].map((sub) => (
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
                              {ans.observation && <p className="text-muted-foreground">{ans.observation}</p>}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
