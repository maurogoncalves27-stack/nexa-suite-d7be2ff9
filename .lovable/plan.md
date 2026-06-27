## Simplificar detecção de loja em ocorrências

Cascata atual tem 5 passos (GPS → allocated_store_id → store_id → regra ESCRITÓRIO → store_terminal_users). Reduzir para 3, removendo as regras frágeis.

### Nova cascata (em `src/pages/Occurrences.tsx#sendRegister`)
1. **GPS** dentro do raio (geofence_radius_m, mínimo 500m) de uma loja real.
2. **`employees.allocated_store_id`** se for loja real.
3. **`store_terminal_users.store_id`** se for loja real.

Se nenhum passo resolver, grava `NULL` e cai na fila de revisão do `/ocorrencias/relatorio` (já implementada).

### O que sai
- Fallback `employees.store_id` (loja matriz, geralmente FÁBRICA — gerava ruído).
- Regra fixa ESCRITÓRIO → ASA SUL (substituída pelo `allocated_store_id`, que para o pessoal do escritório já é "ASA SUL" via cadastro).

### Memória
Atualizar `mem://features/ocorrencias-loja-auto` com a cascata reduzida.

### Não muda
- UI: continua sem campo de loja, é tudo automático.
- Banco: `store_id` segue nullable; fila de revisão cuida de exceções.
- Backfill já feito (4 órfãos restantes ficam na fila para atribuição manual).
