# NEXA ACBr — Setup TEF (PayGo Integrado / Sandbox)

Guia de instalação do **TEF via ACBrLibTEFD + PayGo Integrado** no PC do PDV.
Independente da NFC-e (que usa `ACBrLibNFe` + `ACBrLib.ini`).

---

## 1. Pré-requisitos

- Windows 10/11 64 bits.
- PIN-pad homologado conectado via **USB original** do equipamento.
- PIN-pad deve estar em uma COM **≤ 32** (ideal: a menor COM possível).

---

## 2. Instalar o PayGo Windows (PGWebLib)

1. Baixar o kit de integração (versão mais recente — atual: **5.1.50.2**):
   <https://setis.com.br/filevista/public/j563/paygodev/20260422-integracao-setuppaygowindows-v5-1-50-2.zip>
2. Extrair o ZIP.
3. Executar `SetupPayGo_full_v5.1.47.2.exe` (ou superior).
4. Instalação padrão (ele cria `C:\PGWebLib\` automaticamente).

---

## 3. Ativar modo DEMO (sandbox)

Em produção, este passo será substituído pelo CNPJ/PDC reais do cliente.
Para homologação usamos os dados de teste da Setis:

| Campo | Valor sandbox |
|---|---|
| Endereço | `pos-transac-sb.tpgweb.io` |
| Porta    | `31735` |
| CNPJ     | `44.932.369/0001-08` |
| PDC      | `111476` |

Passos:

1. Abrir o **PayGo Windows**.
2. **Clicar 3× com o botão direito no logo** da aplicação.
3. Aparece uma caixa de diálogo → digitar `demo` → **OK**.
4. A janela do PayGo fica **roxa** = modo DEMO ativo.
5. Habilitar o botão de **instalação da DLL** (canto da tela).
6. Preencher **CNPJ = 44932369000108** e **PDC = 111476**.
7. Clicar **ATIVAR**.

Pronto: PGWebLib está apto a receber chamadas da ACBrLibTEFD.

> 💡 Para validar fora do PDV, abra `CommTestePGWin.exe` (vem no kit) e
> rode uma transação DEMO ou PIX C6 BANK. Se funcionar lá, vai funcionar
> no nosso adapter.

---

## 4. Instalar a ACBrLibTEFD

```
C:\NexaACBr\
├── bin\
│   ├── ACBrTEFD64.dll          ← lib TEF (do projeto ACBrLib)
│   ├── ACBrLibTEFD.ini         ← copiar de electron-acbr/config-samples/
│   ├── ACBrNFe64.dll           ← lib NFC-e (já configurada antes)
│   └── ACBrLib.ini             ← config NFC-e (SEFAZ)
└── logs\
```

Copie o template:

```cmd
copy electron-acbr\config-samples\ACBrLibTEFD.ini C:\NexaACBr\bin\
```

Edite o arquivo se mudar de ambiente (sandbox → produção): troque
`[TEFD_PayGo]` `Endereco/Porta/CNPJ/PontoCaptura`.

---

## 5. Adquirentes disponíveis no sandbox

| Adquirente   | Comportamento |
|--------------|---------------|
| **DEMO**     | Sub-adquirente genérica, aceita qualquer valor. |
| **REDE**     | Aceita **apenas valores inteiros**. Centavos → transação negada. |
| **PIX C6 BANK** | Gera QRCode; transação aprovada automaticamente após alguns segundos. |
| **PIX CIELO**   | Idem ao C6, simulando Cielo. |

---

## 6. Validar a instalação

Inicie o agente:

```cmd
cd electron-acbr
npm start
```

Acesse `http://127.0.0.1:8765/health` e confira:

```json
{
  "ok": true,
  "tefReady": true,
  "tefVersion": "1.x.x",
  "tefDiagnostics": {
    "dllExists": true,
    "iniExists": true,
    "iniSections": ["Principal","TEFD","TEFD_PayGo", ...]
  }
}
```

Se `tefReady = false`, veja `tefDiagnostics.missing` para identificar
o que está faltando (DLL, INI, seção PayGo, etc).

---

## 7. Roteiro de homologação Setis

Após tudo funcionando ponta a ponta no PDV (`/pdv-novo`), executar o
roteiro de testes que está dentro do kit PayGo e enviar as evidências
via Jira: <https://dev.proj.setis.com.br/servicedesk/customer/portal/16>

Prazo de análise: até 5 dias úteis. Se aprovado, recebemos o certificado
de homologação por lá.
