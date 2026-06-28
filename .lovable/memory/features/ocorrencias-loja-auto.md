---
name: Ocorrências - detecção automática de loja
description: Cascata curta GPS → allocated_store_id → store_terminal_users para preencher store_id em occurrence_alerts
type: feature
---
Toda ocorrência (`occurrence_alerts`) precisa ter `store_id` apontando para uma loja real (ASA SUL, ASA NORTE, ÁGUAS CLARAS, LAGO SUL). O registro nunca pede a loja ao usuário — detecta automaticamente em `Occurrences.tsx#sendRegister` nesta ordem:

1. GPS dentro do raio (geofence_radius_m, mínimo 500m) de uma loja real.
2. `employees.allocated_store_id` (se for loja real).
3. `store_terminal_users.store_id` do `user.id` — cobre logins compartilhados de terminal PDV/Totem sem `employees`.

Se nada resolver, grava NULL e o alerta cai na fila "Ocorrências sem loja (a revisar)" em `/ocorrencias/relatorio`, onde admin/gestor atribui manualmente.

Não usar `employees.store_id` (matriz, em geral FÁBRICA — polui dados) nem regras especiais de nome de loja.
