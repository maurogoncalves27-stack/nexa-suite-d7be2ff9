---
name: Ocorrências - detecção automática de loja
description: Ordem de fallback para preencher store_id ao registrar ocorrência; regra ESCRITÓRIO=ASA SUL
type: feature
---
Toda ocorrência (`occurrence_alerts`) precisa ter `store_id` apontando para uma loja real (ASA SUL, ASA NORTE, ÁGUAS CLARAS, LAGO SUL). O registro nunca pede a loja ao usuário — detecta automaticamente em `Occurrences.tsx#sendRegister` nesta ordem:

1. GPS dentro do raio (geofence_radius_m, mínimo 500m) de uma loja real.
2. `employees.allocated_store_id` (se for loja real).
3. `employees.store_id` (se for loja real).
4. Regra fixa: se a loja do colaborador é ESCRITÓRIO → atribui ASA SUL.
5. Último caso (conta sem employee): grava NULL e cai na fila "Ocorrências sem loja (a revisar)" em `/ocorrencias/relatorio`, onde admin/gestor atribui manualmente.

Para fins de relatórios operacionais, ESCRITÓRIO sempre equivale a ASA SUL.
