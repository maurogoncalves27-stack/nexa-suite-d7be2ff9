---
name: TEF PayGo - endpoints sandbox vs produção
description: Endereços/portas e dados de teste do PayGo Web (PGWebLib) para sandbox (DEMO) e produção
type: feature
---

# Ambientes PayGo Web (PGWebLib)

## Sandbox / Homologação (modo DEMO)
- Endereço: `pos-transac-sb.tpgweb.io`
- Porta: `31735`
- CNPJ teste: `44.932.369/0001-08`
- PdC (Ponto de Captura) teste: `111476`
- Ativação: abrir PayGo Windows → **3 cliques com botão direito no logo** → digitar `demo` → janela fica **roxa**.
- `PW_iSetEnvironment(1)` = Homologação.

## Produção
- Endereço: `pl03.pgweb.io`
- Porta: `17500`
- CNPJ e ID PdC = vêm na **ordem de serviço** da Setis para o cliente.
- Senha técnica do menu administrativo: `314159`.
- Ordem oficial (manual ACBr/PayGoWeb Produção):
  1. Função Administrativa → **2 CONFIGURAÇÃO** → senha → ID PdC → `pl03.pgweb.io:17500` → imprime cupom "TRANSACAO FINALIZADA".
  2. Função Administrativa → **1 INSTALAÇÃO** → senha → CNPJ → aguardar (baixa tabelas do servidor) → imprime cupom de instalação com autorizadores (ex.: BIN).
  3. **1ª transação após instalar** faz carga de tabelas — **não abortar/cancelar** (afeta chaves do pinpad).
- `PW_iSetEnvironment(0)` = Produção (padrão, não precisa chamar).
- DLL faz busca automática do pinpad — não configurar pinpad manualmente.

## Reforço
Instalação/ativação é via **UI oficial do PayGo Windows**, NÃO programática. Nosso agente
(`electron-acbr/acbr-tefd.cjs`) só consome a DLL via `PW_iNewTransac → AddParam → ExecTransac
→ GetResult → Confirmation` depois que o PdC já está ativo.
