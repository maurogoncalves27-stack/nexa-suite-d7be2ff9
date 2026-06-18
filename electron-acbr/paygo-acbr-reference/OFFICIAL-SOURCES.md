# Fontes oficiais/funcionais analisadas

Esta pasta fica paralela ao agente principal. Nada aqui deve ser ligado ao app
sem teste real no PayGo/pinpad.

## Downloads úteis

### Demo C# PayGoWeb

Caminho local:

`C:\Users\Mauro\Downloads\Integracao-PayGoWeb-CSharp-main\Integracao-PayGoWeb-CSharp-main`

Arquivos mais importantes:

- `PDV\PDV\MainWindow.xaml.cs`
- `PDV\Muxx.Lib\Services\Fluxos.cs`
- `PDV\Muxx.Lib\Services\PGWebLib.cs`
- `PDV\Muxx.Lib\ValueObjects\Enums\*.cs`
- `PDV\Muxx.Lib\ValueObjects\Structs\*.cs`

Fluxo funcional observado:

1. `Fluxos.Clear()`
2. adicionar parametros base:
   - `PWINFO_AUTNAME = "PDV"`
   - `PWINFO_AUTVER = "1.0.0.0"`
   - `PWINFO_AUTDEV = "PayGo"`
   - `PWINFO_AUTCAP = 384` (`DSP_CHECKOUT` + `DSP_QRCODE`)
   - `PWINFO_DSPQRPREF = checkout`
3. `FluxoInitAsync()`
4. `FluxoPrincipalAsync(PWOPER_ADMIN | PWOPER_SALE)`
5. se houver pendencia, confirmar/desfazer com `FluxoConfirmacaoPendencia`
6. ler resultados com `FluxoGetResultPwInfosAsync`
7. se `PWINFO_CNFREQ = "1"`, chamar `FluxoConfirmacao`

Operacoes da demo usadas no painel paralelo:

- `PWOPER_MAINTENANCE = 0xFE`
- `PWOPER_CONFIG = 0xFD`
- `PWOPER_INSTALL = 0x01`
- `PWOPER_COMMTEST = 0x14`
- `PWOPER_ADMIN = 0x20`
- `PWOPER_SALE = 0x21`

### PGWebLib SDK

Arquivo:

`C:\Users\Mauro\Downloads\20260415-Integracao-PGWebLib_v4.1.50.902.zip`

Conteúdo importante:

- `PGWebLib.h`
- `x64\PGWebLib.dll`
- `x86\PGWebLib.dll`
- `Roteiro de testes\Roteiro de testes v20241216.pdf`

Constantes corrigidas no port TypeScript usando `PGWebLib.h`:

- `PWOPER_ADMIN = 0x20`
- `PWOPER_SALE = 0x21`
- `PWOPER_SALEVOID = 0x22`
- `PWINFO_TRNORIGDATE = 0x57`
- `PWINFO_TRNORIGNSU = 0x58`
- `PWINFO_TRNORIGAMNT = 0x60`
- `PWINFO_TRNORIGAUTH = 0x62`
- `PWINFO_TRNORIGREQNUM = 0x72`
- `PWINFO_TRNORIGTIME = 0x73`
- `PWINFO_TRNORIGLOCREF = 0x78`
- `PWINFO_AUTHPOSQRCODE = 0x1F77`
- `PWINFO_DSPQRPREF = 0x7F50`
- `PWDAT_DSPQRCODE = 20`
- `PWCNF_CNF_AUTO = 0x00000121`
- `PWCNF_REV_MANU_AUT = 0x00003231`

## Material descartado para DLL/pinpad

`C:\Users\Mauro\Downloads\paygo-integration-demo`

Esse projeto parece ser checkout web/mock com Supabase Edge Functions. Pode ajudar
com UI de pagamento, mas não implementa o fluxo local `PGWebLib.dll`/pinpad.

## Pontos de atenção

- O PayGo exige menu administrativo disponível na automação.
- QR Code no checkout depende de `PWINFO_AUTCAP = 384` e `PWINFO_DSPQRPREF`.
- Para Pix, o BR Code vem via `PWINFO_AUTHPOSQRCODE` quando ocorre
  `PWDAT_DSPQRCODE`.
- Confirmação deve usar os 5 campos retornados pela DLL:
  `REQNUM`, `AUTLOCREF`, `AUTEXTREF`, `VIRTMERCH`, `AUTHSYST`.
- Cancelamento/desfazimento não deve usar constantes inventadas; sempre conferir
  `PGWebLib.h`.
