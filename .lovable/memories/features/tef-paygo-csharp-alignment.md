---
name: TEF PayGo — alinhamento C# Setis
description: Agente acbr-tefd.cjs reescrito 100% alinhado ao demo oficial C# da Setis (adminti2/Integracao-PayGoWeb-CSharp)
type: reference
---
Repo de referência: https://github.com/adminti2/Integracao-PayGoWeb-CSharp

Arquivos-fonte no demo:
- PDV/Muxx.Lib/Services/PGWebLib.cs — assinaturas DllImport
- PDV/Muxx.Lib/Services/Fluxos.cs — loop oficial PW_iExecTransac
- PDV/Muxx.Lib/ValueObjects/Structs/PW_GetData.cs — struct (ANSI, Sequential)
- PDV/PDV/MainWindow.xaml.cs — params iniciais e fluxo de venda

Assinaturas críticas (verificadas no PGWebLib.cs):
- PW_iInit(string) → short
- PW_iNewTransac(byte) → short                    (byte, NÃO short)
- PW_iAddParam(ushort, string) → short            (ushort, NÃO short)
- PW_iExecTransac(PW_GetData[9], ref short) → short
- PW_iGetResult(short, char*, uint VALOR) → short (uint por valor!)
- PW_iConfirmation(uint, 5×string) → short        (uint por valor!)
- PW_iPPEventLoop(char*, uint VALOR) → short      (uint por valor!)

Params iniciais obrigatórios em TODA transação (MainWindow.xaml.cs):
- AUTNAME="PDV", AUTVER="1.0.0.0", AUTDEV="PayGo"
- AUTCAP=384 (DSP_CHECKOUT 128 | DSP_QRCODE 256)
- DSPQRPREF=2 (EXIBE_CHECKOUT)

Confirmação: PWCNF_CNF_AUTO = 0x121 (não 0!). Reversão: PWCNF_REV_MANU_AUT = 0x3231.

NÃO existe PW_iSetEnvironment no demo. Ambiente sandbox/produção é definido
ANTES do PayGo subir via ENV: CPFCNPJ, PontoDeCaptura, AmbienteCPAY=DEMO.

Loop FluxoExecTransac: aloca PW_GetData[9], chama PW_iExecTransac com piNumParam=9
ref, em MOREDATA itera as `count` capturas (PWDAT_MENU/TYPED/USERAUTH/CARDINF/etc.)
e continua. Capturas interativas só são processáveis com UI — em headless, abortar.
