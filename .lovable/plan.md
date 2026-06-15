## Simplificar o card "Configurar pinpad"

### Objetivo
Reduzir o card `TefPinpadSetupCard` na página `/configuracoes/tef-paygo` para conter **apenas** o botão "Abrir menu ADM", removendo botões e textos explicativos desnecessários.

### Alterações

**`src/components/tef-paygo/TefPinpadSetupCard.tsx`**

1. **Remover do Card:**
   - Parágrafo explicativo (`<p className="text-sm text-muted-foreground">`)
   - Botões: "Inicializar TEF agora", "Testar comunicação", "Testar porta do pinpad", "Diagnosticar agente"
   - Linha do agente URL (`<p className="text-xs text-muted-foreground">`)
   - Bloco de troubleshooting "Failed to fetch"
   - Bloco de resultado completo (`<details>`)

2. **Manter no Card:**
   - Título "Configurar pinpad"
   - Botão "Abrir menu ADM"
   - Status message (feedback da operação)

3. **Manter fora do Card (dialogs e lógica interna):**
   - Dialog de menu do PayGo
   - Dialog de captura de entrada
   - Toda a lógica de hooks (`run`, `startPolling`, `submitPaygoMenuChoice`, etc.)
   - Imports necessários para o funcionamento do botão "Abrir menu ADM"

### Resultado esperado
Card limpo e focado: título + botão "Abrir menu ADM" + status mínimo de feedback. Toda a funcionalidade do menu administrativo via dialog permanece intacta.