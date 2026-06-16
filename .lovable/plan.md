## Plano aprovado (sem aumentar timeout)

### 1. QR Pix no PC — leitura proativa
No bridge PS/C#, dentro do `ExecLoop`, após cada `PW_iExecTransac` tentar ler `PWINFO_AUTHPOSQRCODE`. Se vier conteúdo novo (diferente do último emitido), disparar evento `QRCODE` imediatamente — sem depender do callback `PWDAT_DSPQRCODE` (que com pref=2 a DLL pode não emitir).

### 2. Não fazer cleanup automático quando há QR Pix gerado
No `acbr-tefd.cjs`, dentro do `catch` da venda: se `saleStatus.qrCode` estiver preenchido, **pular** o pós-cleanup. Só limpa via botão manual, evitando desfazer um Pix que pode estar pago.

### 3. Aviso de sandbox no modal Pix
No `TefTestSaleCard.tsx`, adicionar banner fixo dentro do dialog do QR:
> "Ambiente DEMO — este QR não é Pix real. Não tente pagar pelo app do banco; a aprovação é simulada pelo PayGo."

### 4. Bump de versão
`electron-acbr/package.json` → `1.5.11`.
Atualizar `AGENT_VERSION` e `AGENT_EXE_URL` em `src/pages/TefPaygoSetup.tsx`.

## Fora do escopo
- Aumentar timeout (negado pelo usuário).
- Mexer em iFood, NFC-e, cartão crédito/débito.