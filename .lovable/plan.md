## O que será feito

Permitir escolher o **período de experiência** (inicial + prorrogação opcional) no momento de gerar o contrato, com presets CLT e opção livre, validando o teto de 90 dias.

### 1. Banco — `employees`

Adicionar duas colunas (manter a atual `experience_contract_days` como **período inicial**):

- `experience_initial_days` (int, alias semântico — backfill a partir de `experience_contract_days`)
- `experience_extension_days` (int, nullable) — dias da prorrogação única

> Para evitar quebra de código existente, mantemos `experience_contract_days` como sinônimo do período inicial (atualizamos os dois na gravação).

### 2. UI — `ContractsPanel` (`src/components/announcements/ContractsPanel.tsx`)

Novo bloco "Período de experiência" antes de "Gerar contrato":

- Radio com presets:
  - **14 + 30 dias** (44 no total) — escolha padrão pedida
  - **30 + 60 dias** (90)
  - **45 + 45 dias** (90)
  - **30 + 30 dias** (60)
  - **Período único, sem prorrogação** (campo dias 1–90)
  - **Personalizado** (dois campos: inicial + prorrogação)
- Validação client-side:
  - inicial ≥ 1 e ≤ 90
  - prorrogação ≥ 0 (0 = sem prorrogação) e ≤ 90 − inicial
  - mensagem CLT: "Soma máxima 90 dias. Não é permitida segunda prorrogação (Súmula 188 TST)."
- Ao clicar **Gerar contrato**: persiste `experience_initial_days` e `experience_extension_days` no `employees` do colaborador selecionado, antes do fluxo atual (invalidar assinaturas + criar aviso).

### 3. Template do contrato (`src/lib/contractTemplate.ts` + `src/lib/contractPdf.ts`)

Reescrever a Cláusula 6ª para refletir as duas hipóteses:

- **Com prorrogação:** "Período inicial de **{{periodo_experiencia_inicial}} dias** a partir de **{{data_admissao}}**, prorrogável uma única vez por mais **{{periodo_experiencia_prorrogacao}} dias**, totalizando **{{periodo_experiencia_total}} dias** (art. 445, parágrafo único da CLT). Findo o prazo final sem manifestação contrária, o contrato passará automaticamente a vigorar por prazo indeterminado."
- **Sem prorrogação:** texto simples com `{{periodo_experiencia_inicial}}`.

Novos placeholders no `contractPdf.ts` (mantém `{{periodo_experiencia}}` por retrocompatibilidade = total):
- `{{periodo_experiencia_inicial}}`
- `{{periodo_experiencia_prorrogacao}}`
- `{{periodo_experiencia_total}}`

A renderização escolhe um dos dois blocos conforme `extension_days > 0`.

### 4. Cadastro do colaborador (`ContractCard.tsx`)

Apenas exibir os dois campos como **leitura/edição opcional** (default permanece "definido na hora de gerar contrato"). Sem mudança de regra obrigatória.

---

## Regras CLT aplicadas (resumo, art. 443 §2º "c", 445 parágrafo único, Súmula 188 TST)

- Máximo **90 dias** somados.
- **Uma única prorrogação** permitida.
- Contrato escrito.
- Rescisão antecipada segue arts. 479/480 (ou 481 se houver cláusula assecuratória).
- Renovação de novo contrato de experiência com o mesmo empregador só após **6 meses** (art. 452).

## Arquivos afetados

```text
supabase/migrations/<novo>.sql                              (add 2 colunas + backfill)
src/components/announcements/ContractsPanel.tsx             (UI de seleção + persist)
src/lib/contractTemplate.ts                                 (cláusula 6ª reescrita)
src/lib/contractPdf.ts                                      (novos placeholders)
src/components/employees/form/ContractCard.tsx              (mostra os 2 campos)
src/pages/EmployeeForm.tsx                                  (schema + payload)
```

## Fora do escopo

- Não muda nada na folha/rescisão.
- Não toca contratos de **estágio** (`InternshipContractCard`) nem em assinaturas já emitidas.
