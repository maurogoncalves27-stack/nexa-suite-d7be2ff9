import { useState, useEffect, useCallback } from "react";
import { Plus, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NutriItem {
  id: string;
  name: string;
  category: number;
  created_by: string;
}

interface DayRecord {
  item_id: string;
  sim_nao: boolean;
  note: string;
}

interface Props {
  currentDate: Date;
  storeId: string | null;
}

// Higiene dos manipuladores = categoria 1
const CATEGORY = 1;

export const NutriDailyChecklist = ({ currentDate, storeId }: Props) => {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<NutriItem[]>([]);
  const [records, setRecords] = useState<Record<string, DayRecord>>({});
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState("");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const dateKey = format(currentDate, "yyyy-MM-dd");

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("nutri_items")
      .select("*")
      .eq("category", CATEGORY)
      .order("created_at");
    if (error) {
      toast.error("Erro ao carregar itens");
      return;
    }
    setItems(data ?? []);
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("nutri_day_records")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", dateKey);
    if (error) {
      toast.error("Erro ao carregar registros");
      return;
    }
    const map: Record<string, DayRecord> = {};
    (data ?? []).forEach((r) => {
      map[r.item_id] = { item_id: r.item_id, sim_nao: r.sim_nao, note: r.note };
    });
    setRecords(map);
  }, [user, dateKey]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchItems(), fetchRecords()]).finally(() => setLoading(false));
  }, [fetchItems, fetchRecords]);

  const addItem = async () => {
    const name = newItemName.trim();
    if (!name || !user) return;
    const { error } = await supabase
      .from("nutri_items")
      .insert({ name, created_by: user.id, category: CATEGORY });
    if (error) {
      toast.error("Erro ao adicionar item");
      return;
    }
    setNewItemName("");
    fetchItems();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("nutri_items").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir item");
      return;
    }
    fetchItems();
  };

  const updateItemName = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from("nutri_items").update({ name }).eq("id", id);
    if (error) {
      toast.error("Erro ao editar item");
      return;
    }
    setEditingItem(null);
    setEditName("");
    fetchItems();
  };

  const upsertRecord = async (
    itemId: string,
    updates: Partial<{ sim_nao: boolean; note: string }>,
  ) => {
    if (!user) return;
    if (!storeId) {
      toast.error("Selecione uma loja");
      return;
    }
    const current = records[itemId] ?? { item_id: itemId, sim_nao: false, note: "" };
    const newRecord = { ...current, ...updates };

    const { error } = await supabase.from("nutri_day_records").upsert(
      {
        user_id: user.id,
        item_id: itemId,
        date: dateKey,
        sim_nao: newRecord.sim_nao,
        note: newRecord.note,
        store_id: storeId,
      },
      { onConflict: "user_id,item_id,date" },
    );
    if (error) {
      toast.error("Erro ao salvar registro");
      return;
    }
    setRecords((prev) => ({ ...prev, [itemId]: newRecord }));
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-12 text-sm">Carregando...</p>;
  }

  return (
    <div>
      {isAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addItem();
          }}
          className="flex gap-2 mb-4"
        >
          <Input
            placeholder="Adicionar novo item de higiene..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 h-9 text-sm"
          />
          <Button type="submit" size="icon" className="h-9 w-9" disabled={!newItemName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-center text-muted-foreground py-12 text-sm">
            Nenhum item cadastrado. {isAdmin && "Adicione acima."}
          </p>
        )}
        {items.map((item) => {
          const record = records[item.id] ?? { item_id: item.id, sim_nao: false, note: "" };
          const isExpanded = expandedNote === item.id;
          const isEditing = editingItem === item.id;
          return (
            <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3">
                <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                  <Switch
                    checked={record.sim_nao === true}
                    onCheckedChange={(checked) => {
                      upsertRecord(item.id, { sim_nao: checked });
                    }}
                  />
                  <span className="text-xs font-semibold w-7 text-foreground">
                    {record.sim_nao && records[item.id] !== undefined ? "Sim" : "Não"}
                  </span>
                </label>

                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateItemName(item.id);
                    }}
                    className="flex-1 flex flex-wrap gap-1.5"
                  >
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-9 text-sm flex-1 min-w-[120px]"
                      autoFocus
                    />
                    <Button type="submit" size="sm" className="h-9 text-xs">
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setEditingItem(null)}
                    >
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <span
                    className={`flex-1 text-sm leading-snug ${
                      record.sim_nao ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {item.name}
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setExpandedNote(isExpanded ? null : item.id)}
                >
                  <MessageSquare
                    className={`h-4 w-4 ${record.note ? "text-primary" : "text-muted-foreground"}`}
                  />
                </Button>

                {isAdmin && !isEditing && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setEditingItem(item.id);
                        setEditName(item.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <Textarea
                    placeholder="Observação (opcional)..."
                    value={record.note}
                    onChange={(e) => upsertRecord(item.id, { note: e.target.value })}
                    className="text-sm min-h-[60px] resize-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
