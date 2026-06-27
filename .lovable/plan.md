## Diagnóstico

145 ocorrências, 57 sem loja. A loja pode ser inferida automaticamente via `employees.allocated_store_id` (loja real de alocação) — não precisa pedir nada ao usuário.

Mapeamento dos 57 órfãos por `allocated_store_id` do autor:

| Loja alocada | Qtd |
|---|---|
| ÁGUAS CLARAS | 10 |
| ASA SUL | 7 |
| ASA NORTE | 2 |
| LAGO SUL | 1 |
| ESCRITÓRIO → ASA SUL (regra fixa) | 1 |
| Sem employee vinculado (managers antigos/contas admin) | 36 |

**Causa raiz** (`src/pages/Occurrences.tsx` 382–419): a detecção só consulta `employees.store_id` (matriz, geralmente FÁBRICA) + GPS. Nunca usa `allocated_store_id`, então cai em `NULL`.

## Plano

### 1. Corrigir detecção no registro (`src/pages/Occurrences.tsx`)
Trocar a ordem de fallback dentro de `sendRegister` para **sempre achar uma loja real**, sem pedir nada ao usuário:

1. GPS dentro do raio de uma loja real → usa essa loja.
2. Senão, `employees.allocated_store_id` (se for loja real).
3. Senão, `employees.store_id` (se for loja real).
4. Senão, regra: `ESCRITÓRIO` → `ASA SUL`.
5. Senão (último fallback, conta sem employee), buscar a loja real mais antiga/principal do sistema OU manter `NULL` e cair na fila de revisão (passo 3).

Atualizar a query para trazer `allocated_store_id` e o nome da loja alocada. Nenhuma mudança de UI — usuário continua só apertando "Registrar".

### 2. Backfill automático — 21 dos 57
Insert/update SQL:
- `ESCRITÓRIO` (1 registro) → `ASA SUL`.
- Demais 20 → `allocated_store_id` do autor.

### 3. Fila de revisão para os 36 sem employee
Em `src/pages/OccurrencesReport.tsx`, card **"Ocorrências sem loja (a revisar)"**:
- Lista os pendentes com autor/data/ocorrência.
- Botão "Atribuir loja" com select das 4 lojas reais → grava `store_id`.
- Banner com contagem; some quando zerar.

Esses 36 são casos legados de managers sem `employees` — a partir do passo 1 não geram mais órfãos, então a fila não cresce.

### 4. Memória
- `ESCRITÓRIO` = `ASA SUL` para fins operacionais.
- Detecção de loja em ocorrências usa GPS → `allocated_store_id` → `store_id` (se real) → regra ESCRITÓRIO.

### 5. (Opcional, depois) `NOT NULL` em `occurrence_alerts.store_id`
Só depois da fila zerada, sob confirmação. Sem isso, qualquer brecha futura volta a gerar órfãos.
