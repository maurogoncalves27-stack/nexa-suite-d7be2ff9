param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("sale", "confirm", "undo", "commtest", "install", "admin", "host")]
  [string] $Action,

  [string] $DllPath = "C:\Program Files (x86)\PayGo\PGWebLib\x64\PGWebLib.dll",
  [string] $WorkingDir = "C:\Program Files (x86)\PayGo\PGWebLib\x64",
  [string] $SaleId = "",
  [int] $AmountInCents = 0,
  [string] $Method = "DEBITO",
  [int] $Installments = 1,
  [string] $PaygoMenuChoice = "",
  [string] $CaptureValuesBase64 = "",
  [string] $ConfirmationJsonBase64 = "",
  [string] $CpfCnpj = "",
  [string] $PontoDeCaptura = "",
  [string] $Ambiente = "",
  [string] $SenhaTecnica = "",
  [string] $UsePinpad = "1",
  [string] $PinpadPort = ""
)

$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;

public static class PayGoBridge
{
    private static IntPtr _dll = IntPtr.Zero;
    private static bool _initialized = false;

    private const short PWRET_OK = 0;
    private const short PWRET_FROMHOSTPENDTRN = -2599;
    private const short PWRET_MOREDATA = -2497;
    private const short PWRET_NODATA = -2496;
    private const short PWRET_DISPLAY = -2495;
    private const short PWRET_NOTHING = -2493;
    private const short PWRET_CANCEL = -2491;
    private const short PWRET_TIMEOUT = -2490;
    private const short PWRET_PPNOTFOUND = -2489;
    private const short PWRET_FALLBACK = -2486;
    private const short BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT = 1;

    private const byte PWOPER_SALE = 0x21;
    private const byte PWOPER_INSTALL = 0x01;
    private const byte PWOPER_ADMIN = 0x20;

    private const ushort PWINFO_AUTNAME = 0x15;
    private const ushort PWINFO_AUTVER = 0x16;
    private const ushort PWINFO_AUTDEV = 0x17;
    private const ushort PWINFO_AUTIP = 0x05;
    private const ushort PWINFO_AUTPORT = 0x07;
    private const ushort PWINFO_POSID = 0x11;
    private const ushort PWINFO_DESTTCPIP = 0x1B;
    private const ushort PWINFO_MERCHCNPJCPF = 0x1C;
    private const ushort PWINFO_AUTCAP = 0x24;
    private const ushort PWINFO_TOTAMNT = 0x25;
    private const ushort PWINFO_CURRENCY = 0x26;
    private const ushort PWINFO_CURREXP = 0x27;
    private const ushort PWINFO_FISCALREF = 0x28;
    private const ushort PWINFO_CARDTYPE = 0x29;
    private const ushort PWINFO_FINTYPE = 0x3B;
    private const ushort PWINFO_INSTALLMENTS = 0x3C;
    private const ushort PWINFO_RESULTMSG = 0x42;
    private const ushort PWINFO_CNFREQ = 0x43;
    private const ushort PWINFO_AUTHCODE = 0x46;
    private const ushort PWINFO_RCPTFULL = 0x52;
    private const ushort PWINFO_RCPTMERCH = 0x53;
    private const ushort PWINFO_RCPTCHOLDER = 0x54;
    private const ushort PWINFO_CARDNAME = 0x4B;
    private const ushort PWINFO_AUTHSYST = 0x35;
    private const ushort PWINFO_VIRTMERCH = 0x36;
    private const ushort PWINFO_REQNUM = 0x32;
    private const ushort PWINFO_AUTLOCREF = 0x44;
    private const ushort PWINFO_AUTEXTREF = 0x45;
    private const ushort PWINFO_AUTHMNGTUSER = 0xF5;
    private const ushort PWINFO_AUTHTECHUSER = 0xF6;
    private const ushort PWINFO_DSPQRPREF = 0x7F50;
    private const ushort PWINFO_PAYMNTTYPE = 0x1F21;
    private const ushort PWINFO_USINGPINPAD = 0x7F01;
    private const ushort PWINFO_PPCOMMPORT = 0x7F02;

    private const uint PWCNF_CNF_AUTO = 0x00000121;
    private const uint PWCNF_REV_MANU_AUT = 0x00003231;

    private const byte PWDAT_CARDINF = 3;
    private const byte PWDAT_MENU = 1;
    private const byte PWDAT_TYPED = 2;
    private const byte PWDAT_PPENTRY = 5;
    private const byte PWDAT_PPENCPIN = 6;
    private const byte PWDAT_CARDOFF = 9;
    private const byte PWDAT_CARDONL = 10;
    private const byte PWDAT_PPCONF = 11;
    private const byte PWDAT_BARCODE = 12;
    private const byte PWDAT_PPREMCRD = 13;
    private const byte PWDAT_PPGENCMD = 14;
    private const byte PWDAT_PPDATAPOSCNF = 16;
    private const byte PWDAT_USERAUTH = 17;
    private const byte PWDAT_DSPCHECKOUT = 18;
    private const byte PWDAT_TSTKEY = 19;
    private const byte PWDAT_DSPQRCODE = 20;

    private static string _cpfCnpj = "";
    private static string _pontoDeCaptura = "";
    private static string _ambiente = "";
    private static string _senhaTecnica = "";
    private static string _usePinpad = "1";
    private static string _pinpadPort = "";
    private static string _paygoMenuChoice = "";
    private static string _eventId = "";
    private static Dictionary<string, string> _captureValues = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct PW_GetData
    {
        public ushort wIdentificador;
        public byte bTipoDeDado;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szPrompt;
        public byte bNumOpcoesMenu;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 40)]
        public TextoMenu[] vszTextoMenu;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 40)]
        public ValorMenu[] vszValorMenu;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 41)]
        public string szMascaraDeCaptura;
        public byte bTiposEntradaPermitidos;
        public byte bTamanhoMinimo;
        public byte bTamanhoMaximo;
        public int ulValorMinimo;
        public int ulValorMaximo;
        public byte bOcultarDadosDigitados;
        public byte bValidacaoDado;
        public byte bAceitaNulo;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 41)]
        public string szValorInicial;
        public byte bTeclasDeAtalho;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szMsgValidacao;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szMsgConfirmacao;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szMsgDadoMaior;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szMsgDadoMenor;
        public byte bCapturarDataVencCartao;
        public int ulTipoEntradaCartao;
        public byte bItemInicial;
        public byte bNumeroCapturas;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 84)]
        public string szMsgPrevia;
        public byte bTipoEntradaCodigoBarras;
        public byte bOmiteMsgAlerta;
        public byte bStartFromLeft;
        public byte bNotificarCancelamento;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct TextoMenu
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 41)]
        public string szTextoMenu;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct ValorMenu
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szValorMenu;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iInit_(string pszWorkingDir);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iNewTransac_(byte bOper);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iAddParam_(ushort wParam, string pszValue);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iExecTransac_([Out] PW_GetData[] vstParam, ref short piNumParam);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iGetResult_(short iInfo, [Out] StringBuilder pszData, uint ulDataSize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iConfirmation_(uint ulResult, string pszReqNum, string pszLocRef, string pszExtRef, string pszVirtMerch, string pszAuthSyst);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPEventLoop_([Out] StringBuilder pszDisplay, uint ulDisplaySize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPAbort_();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPGetCard_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPGetPIN_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPGetData_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPGoOnChip_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPFinishChip_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPConfirmData_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPRemoveCard_();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPGenericCMD_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPPositiveConfirmation_(ushort uiIndex);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate short PW_iPPTestKey_(ushort uiIndex);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LoadLibrary(string lpFileName);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetProcAddress(IntPtr hModule, string procName);

    public static string Sale(string dllPath, string workingDir, string saleId, int amountInCents, string method, int installments, string paygoMenuChoice, string captureValuesBase64)
    {
        try
        {
            _paygoMenuChoice = paygoMenuChoice ?? "";
            _captureValues = ParseCaptureValues(captureValuesBase64);
            EmitEvent("INFO", "Iniciando venda PayGo TEF");

            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            ret = Fn<PW_iNewTransac_>("PW_iNewTransac")(PWOPER_SALE);
            if (ret != PWRET_OK) return Error("PW_iNewTransac", ret);

            Add(PWINFO_AUTNAME, "PDV");
            Add(PWINFO_AUTVER, "1.0.0");
            Add(PWINFO_AUTDEV, "PayGo");
            Add(PWINFO_AUTCAP, "452"); // valor fixo + vias diferenciadas + remocao cartao + display checkout + QR checkout
            Add(PWINFO_DSPQRPREF, "2");
            Add(PWINFO_TOTAMNT, amountInCents.ToString());
            Add(PWINFO_CURRENCY, "986");
            Add(PWINFO_CURREXP, "2");
            Add(PWINFO_FISCALREF, saleId);

            if (method == "CREDITO")
            {
                Add(PWINFO_CARDTYPE, "1");
                Add(PWINFO_FINTYPE, installments > 1 ? "4" : "1");
                Add(PWINFO_INSTALLMENTS, Math.Max(1, installments).ToString());
                Add(PWINFO_PAYMNTTYPE, "1");
            }
            else if (method == "DEBITO")
            {
                Add(PWINFO_CARDTYPE, "2");
                Add(PWINFO_FINTYPE, "1");
                Add(PWINFO_PAYMNTTYPE, "1");
            }
            else if (method == "PIX_TEF")
            {
                Add(PWINFO_PAYMNTTYPE, "8");
            }

            ret = ExecLoop();
            if (ret == BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT)
            {
                EmitEvent("APPROVED", "Transacao autorizada. Finalizando fluxo do pinpad.");
                return Json("approved", true, First(Result(PWINFO_RESULTMSG), "Transacao autorizada"), PWRET_OK, ResultsJson(true));
            }

            if (ret == PWRET_FROMHOSTPENDTRN)
            {
                return Json("pendingConfirmation", false, "Existe transacao pendente de confirmacao no PayGo", ret, ResultsJson(true));
            }

            if (ret != PWRET_OK)
            {
                string resultMessage = Result(PWINFO_RESULTMSG);
                if (ret == -2582)
                {
                    EmitEvent("ERROR", "Queda de conexao com o host PayGo. Transacao sem autorizacao.");
                }

                if (ret == PWRET_TIMEOUT && IsAuthorizedMessage(resultMessage))
                {
                    AbortPinpad();
                    EmitEvent("APPROVED", "Transacao autorizada. Timeout apenas na finalizacao do pinpad.");
                    return Json("approved", true, resultMessage, ret, ResultsJson(true));
                }

                EmitEvent("DENIED", First(resultMessage, "Transacao nao aprovada pelo PayGo"));
                return Json("denied", false, resultMessage, ret, ResultsJson(false));
            }

            EmitEvent("APPROVED", "Transacao autorizada pelo PayGo");
            return Json("approved", true, Result(PWINFO_RESULTMSG), ret, ResultsJson(true));
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    public static string Operation(string dllPath, string workingDir, byte operation, string cpfCnpj, string pontoDeCaptura, string ambiente, string senhaTecnica, string usePinpad, string pinpadPort)
    {
        try
        {
            _cpfCnpj = Digits(cpfCnpj);
            _pontoDeCaptura = pontoDeCaptura ?? "";
            _ambiente = ambiente ?? "";
            _senhaTecnica = senhaTecnica ?? "";
            _usePinpad = String.IsNullOrWhiteSpace(usePinpad) ? "1" : usePinpad;
            _pinpadPort = NormalizePinpadPort(pinpadPort);

            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            ret = Fn<PW_iNewTransac_>("PW_iNewTransac")(operation);
            if (ret != PWRET_OK) return Error("PW_iNewTransac", ret);

            Add(PWINFO_AUTNAME, "PDV");
            Add(PWINFO_AUTVER, "1.0.0");
            Add(PWINFO_AUTDEV, "PayGo");
            Add(PWINFO_AUTCAP, "452");
            Add(PWINFO_DSPQRPREF, "2");

            AddActivationParams();

            ret = ExecLoop();
            if (ret != PWRET_OK) return Error("PW_iExecTransac", ret);

            return "{\"ok\":true,\"status\":\"ok\",\"message\":\"Operacao PayGo concluida\"}";
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    public static string CommTest(string dllPath, string workingDir)
    {
        try
        {
            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);
            return "{\"ok\":true,\"status\":\"initialized\",\"message\":\"PGWebLib inicializada\",\"workingDir\":\"" + Esc(workingDir) + "\"}";
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    public static string Confirm(string dllPath, string workingDir, string reqNum, string locRef, string extRef, string virtMerch, string authSyst)
    {
        return Confirmation(dllPath, workingDir, PWCNF_CNF_AUTO, reqNum, locRef, extRef, virtMerch, authSyst);
    }

    public static string Undo(string dllPath, string workingDir, string reqNum, string locRef, string extRef, string virtMerch, string authSyst)
    {
        return Confirmation(dllPath, workingDir, PWCNF_REV_MANU_AUT, reqNum, locRef, extRef, virtMerch, authSyst);
    }

    private static string Confirmation(string dllPath, string workingDir, uint confirmation, string reqNum, string locRef, string extRef, string virtMerch, string authSyst)
    {
        try
        {
            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            ret = Fn<PW_iConfirmation_>("PW_iConfirmation")(confirmation, reqNum ?? "", locRef ?? "", extRef ?? "", virtMerch ?? "", authSyst ?? "");
            if (ret != PWRET_OK) return Error("PW_iConfirmation", ret);
            EmitEvent("CONFIRMED", confirmation == PWCNF_CNF_AUTO ? "Confirmacao enviada ao PayGo" : "Desfazimento enviado ao PayGo");
            return "{\"ok\":true,\"status\":\"confirmed\",\"message\":\"PW_iConfirmation OK\"}";
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    private static short ExecLoop()
    {
        short count = 0;
        PW_GetData[] data = null;
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(EnvInt("PAYGO_TRANSACTION_TIMEOUT_MS", 600000));

        while (true)
        {
            if (DateTime.UtcNow > deadline) return PWRET_TIMEOUT;

            for (int i = 0; i < count; i++)
            {
                if (DateTime.UtcNow > deadline) return PWRET_TIMEOUT;
                short ret = HandleData(data[i], (ushort)i);
                if (ret != PWRET_OK) return ret;
            }

            count = 9;
            data = NewDataArray(count);
            EmitEvent("INFO", "Processando transacao no PayGo");
            short execRet = Fn<PW_iExecTransac_>("PW_iExecTransac")(data, ref count);

            if (execRet == PWRET_MOREDATA || execRet == PWRET_NOTHING) continue;
            return execRet;
        }
    }

    private static short HandleData(PW_GetData data, ushort index)
    {
        short ret;
            switch (data.bTipoDeDado)
            {
            case PWDAT_MENU:
                return AddMenuChoice(data);
            case PWDAT_TYPED:
                EmitEvent("INFO", "PayGo solicitou captura digitada: " + CaptureDescription(data));
                return AddTypedValue(data, "TYPED");
            case PWDAT_BARCODE:
                EmitEvent("INFO", "PayGo solicitou codigo de barras: " + CaptureDescription(data));
                return AddTypedValue(data, "BARCODE");
            case PWDAT_CARDINF:
                if (data.ulTipoEntradaCartao == 1)
                {
                    EmitEvent("INFO", "PayGo solicitou dados do cartao digitados");
                    return AddTypedValue(data, "CARDINF");
                }
                if (data.ulTipoEntradaCartao == 2 || data.ulTipoEntradaCartao == 3)
                {
                    EmitEvent("PINPAD", "Aguardando cartao no pinpad");
                    ret = Fn<PW_iPPGetCard_>("PW_iPPGetCard")(index);
                    if (ret != PWRET_OK) return ret;
                    ret = PinpadLoop("card");
                    if (ret == PWRET_FALLBACK && data.ulTipoEntradaCartao == 3)
                    {
                        EmitEvent("INFO", "Pinpad solicitou fallback para digitacao do cartao");
                        return AddTypedValue(data, "CARDINF");
                    }
                    return ret;
                }
                return -2499;
            case PWDAT_DSPCHECKOUT:
                EmitEvent("INFO", First(data.szValorInicial, "PayGo solicitou exibicao no checkout"));
                return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, data.szValorInicial ?? "");
            case PWDAT_DSPQRCODE:
                EmitEvent("INFO", "PayGo solicitou exibicao de QR Code");
                return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, data.szValorInicial ?? "");
            case PWDAT_PPENTRY:
                EmitEvent("PINPAD", "Aguardando entrada de dados no pinpad");
                ret = Fn<PW_iPPGetData_>("PW_iPPGetData")(index);
                return ret == PWRET_OK ? PinpadLoop("entry") : ret;
            case PWDAT_PPENCPIN:
                EmitEvent("PINPAD", "Aguardando senha no pinpad");
                ret = Fn<PW_iPPGetPIN_>("PW_iPPGetPIN")(index);
                return ret == PWRET_OK ? PinpadLoop("pin") : ret;
            case PWDAT_CARDOFF:
                EmitEvent("PINPAD", "Processando chip offline");
                ret = Fn<PW_iPPGoOnChip_>("PW_iPPGoOnChip")(index);
                return ret == PWRET_OK ? PinpadLoop("offlineChip") : ret;
            case PWDAT_CARDONL:
                EmitEvent("PINPAD", "Processando chip online");
                ret = Fn<PW_iPPFinishChip_>("PW_iPPFinishChip")(index);
                return ret == PWRET_OK ? PinpadLoop("onlineChip") : ret;
            case PWDAT_PPCONF:
                EmitEvent("PINPAD", "Confirmando dados no pinpad");
                ret = Fn<PW_iPPConfirmData_>("PW_iPPConfirmData")(index);
                return ret == PWRET_OK ? PinpadLoop("confirmData") : ret;
            case PWDAT_PPREMCRD:
                EmitEvent("PINPAD", "Remova o cartao do pinpad");
                ret = Fn<PW_iPPRemoveCard_>("PW_iPPRemoveCard")();
                if (ret != PWRET_OK) return ret;
                ret = PinpadLoop("removeCard");
                if (ret == PWRET_TIMEOUT && IsAuthorizedMessage(Result(PWINFO_RESULTMSG)))
                {
                    AbortPinpad();
                    return BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT;
                }
                return ret;
            case PWDAT_PPGENCMD:
                EmitEvent("PINPAD", "Executando comando no pinpad");
                ret = Fn<PW_iPPGenericCMD_>("PW_iPPGenericCMD")(index);
                return ret == PWRET_OK ? PinpadLoop("genericCommand") : ret;
            case PWDAT_PPDATAPOSCNF:
                EmitEvent("PINPAD", "Enviando confirmacao positiva ao pinpad");
                ret = Fn<PW_iPPPositiveConfirmation_>("PW_iPPPositiveConfirmation")(index);
                return ret == PWRET_OK ? PinpadLoop("positiveConfirmation") : ret;
            case PWDAT_USERAUTH:
                EmitEvent("INFO", "PayGo solicitou autenticacao tecnica");
                return AddUserAuthValue(data);
            case PWDAT_TSTKEY:
                EmitEvent("PINPAD", "Testando chave do pinpad");
                ret = Fn<PW_iPPTestKey_>("PW_iPPTestKey")(index);
                return ret == PWRET_OK ? PinpadLoop("testKey") : ret;
            default:
                throw new Exception("Tipo de captura PayGo nao tratado. Tipo=" + data.bTipoDeDado + " Identificador=" + FormatIdentifier(data.wIdentificador) + " Prompt=" + data.szPrompt);
        }
    }

    private static short AddMenuChoice(PW_GetData data)
    {
        if (data.bNumOpcoesMenu < 1 || data.vszValorMenu == null || data.vszValorMenu.Length == 0)
        {
            return -2499;
        }

        if (String.IsNullOrWhiteSpace(_paygoMenuChoice))
        {
            EmitEvent("INFO", "PayGo solicitou selecao de menu: " + MenuOptions(data));
            throw new Exception("PayGo solicitou menu sem opcao selecionada. Opcoes: " + MenuOptions(data));
        }

        EmitEvent("INFO", "PayGo solicitou selecao de menu: " + MenuOptions(data));
        string normalizedChoice = NormalizeChoice(_paygoMenuChoice);
        string value = "";

        for (int i = 0; i < data.bNumOpcoesMenu; i++)
        {
            string text = data.vszTextoMenu != null && i < data.vszTextoMenu.Length ? data.vszTextoMenu[i].szTextoMenu : "";
            string optionValue = data.vszValorMenu != null && i < data.vszValorMenu.Length ? data.vszValorMenu[i].szValorMenu : "";

            if (NormalizeChoice(text) == normalizedChoice || NormalizeChoice(optionValue) == normalizedChoice)
            {
                value = optionValue;
                if (String.IsNullOrWhiteSpace(value)) value = text;
                break;
            }
        }

        if (String.IsNullOrWhiteSpace(value))
        {
            throw new Exception("Opcao de menu PayGo nao encontrada: " + _paygoMenuChoice + ". Opcoes: " + MenuOptions(data));
        }

        EmitEvent("INFO", "Opcao PayGo selecionada: " + _paygoMenuChoice);
        short ret = Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, value ?? "");
        return ret;
    }

    private static string MenuOptions(PW_GetData data)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < data.bNumOpcoesMenu; i++)
        {
            if (i > 0) sb.Append(", ");
            string text = data.vszTextoMenu != null && i < data.vszTextoMenu.Length ? data.vszTextoMenu[i].szTextoMenu : "";
            string value = data.vszValorMenu != null && i < data.vszValorMenu.Length ? data.vszValorMenu[i].szValorMenu : "";
            sb.Append(String.IsNullOrWhiteSpace(text) ? "(sem texto)" : text.Trim());
            if (!String.IsNullOrWhiteSpace(value)) sb.Append("=").Append(value.Trim());
        }
        return sb.ToString();
    }

    private static string NormalizeChoice(string value)
    {
        return (value ?? "").Trim().ToUpperInvariant();
    }

    private static short AddTypedValue(PW_GetData data, string captureAlias)
    {
        string value = ResolveTypedValue(data, captureAlias);
        if (String.IsNullOrWhiteSpace(value) && data.bAceitaNulo != 1)
        {
            throw new Exception("PayGo solicitou captura sem valor disponivel. " + CaptureDescription(data) + ". Informe em Capturas adicionais usando uma das chaves: " + CaptureKeys(data, captureAlias));
        }

        EmitEvent("INFO", "Captura informada para " + FormatIdentifier(data.wIdentificador));
        short ret = Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, value ?? "");
        return ret;
    }

    private static short AddUserAuthValue(PW_GetData data)
    {
        string value = "";
        if (data.wIdentificador == PWINFO_AUTHTECHUSER || data.wIdentificador == PWINFO_AUTHMNGTUSER)
        {
            value = _senhaTecnica;
        }

        if (String.IsNullOrWhiteSpace(value))
        {
            value = CaptureValue(data, "USERAUTH");
        }

        if (String.IsNullOrWhiteSpace(value) && data.bAceitaNulo != 1)
        {
            throw new Exception("PayGo solicitou senha/autenticacao sem valor informado. " + CaptureDescription(data) + ". Informe em Capturas adicionais usando uma das chaves: " + CaptureKeys(data, "USERAUTH"));
        }

        return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, value ?? "");
    }

    private static string ResolveTypedValue(PW_GetData data, string captureAlias)
    {
        if (data.wIdentificador == PWINFO_MERCHCNPJCPF) return _cpfCnpj;
        if (data.wIdentificador == PWINFO_POSID) return _pontoDeCaptura;
        if (data.wIdentificador == PWINFO_DESTTCPIP) return _ambiente;
        if (data.wIdentificador == PWINFO_AUTIP) return AmbienteHost();
        if (data.wIdentificador == PWINFO_AUTPORT) return AmbientePort();
        if (data.wIdentificador == PWINFO_USINGPINPAD) return _usePinpad;
        if (data.wIdentificador == PWINFO_PPCOMMPORT) return _pinpadPort;

        string prompt = (data.szPrompt ?? "").ToUpperInvariant();
        if (prompt.Contains("SENHA") && (prompt.Contains("TECNICA") || prompt.Contains("TÉCNICA"))) return _senhaTecnica;
        if (prompt.Contains("CNPJ") || prompt.Contains("CPF")) return _cpfCnpj;
        if (prompt.Contains("PONTO") || prompt.Contains("CAPTURA") || prompt.Contains("PDC") || prompt.Contains("TERMINAL")) return _pontoDeCaptura;
        if (prompt.Contains("AMBIENTE")) return _ambiente;
        if (prompt.Contains("ENDERECO") || prompt.Contains("ENDEREÇO") || prompt.Contains("HOST")) return AmbienteHost();
        if (prompt.Contains("PORTA")) return AmbientePort();

        string mapped = CaptureValue(data, captureAlias);
        if (!String.IsNullOrWhiteSpace(mapped)) return mapped;

        return data.szValorInicial ?? "";
    }

    private static string CaptureValue(PW_GetData data, string captureAlias)
    {
        string value;
        foreach (string key in CaptureKeyList(data, captureAlias))
        {
            if (_captureValues.TryGetValue(key, out value)) return value;
        }
        return "";
    }

    private static string CaptureKeys(PW_GetData data, string captureAlias)
    {
        return String.Join(", ", CaptureKeyList(data, captureAlias));
    }

    private static IEnumerable<string> CaptureKeyList(PW_GetData data, string captureAlias)
    {
        if (!String.IsNullOrWhiteSpace(captureAlias)) yield return captureAlias;
        yield return data.wIdentificador.ToString();
        yield return FormatIdentifier(data.wIdentificador);
        if (!String.IsNullOrWhiteSpace(data.szPrompt)) yield return NormalizeChoice(data.szPrompt);
    }

    private static string CaptureDescription(PW_GetData data)
    {
        return "Identificador=" + FormatIdentifier(data.wIdentificador) +
               " Prompt=" + (data.szPrompt ?? "") +
               " Mascara=" + (data.szMascaraDeCaptura ?? "") +
               " Min=" + data.bTamanhoMinimo +
               " Max=" + data.bTamanhoMaximo +
               " AceitaNulo=" + data.bAceitaNulo;
    }

    private static string FormatIdentifier(ushort identifier)
    {
        return "0x" + identifier.ToString("X");
    }

    private static Dictionary<string, string> ParseCaptureValues(string captureValuesBase64)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (String.IsNullOrWhiteSpace(captureValuesBase64)) return values;

        string text = Encoding.UTF8.GetString(Convert.FromBase64String(captureValuesBase64));
        string[] lines = text.Replace("\r", "").Split('\n');
        foreach (string rawLine in lines)
        {
            string line = rawLine.Trim();
            if (String.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
            int index = line.IndexOf('=');
            if (index <= 0) continue;
            string key = line.Substring(0, index).Trim();
            string value = line.Substring(index + 1).Trim();
            if (!String.IsNullOrWhiteSpace(key)) values[key] = value;
        }

        return values;
    }

    private static void AddActivationParams()
    {
        if (!String.IsNullOrWhiteSpace(_cpfCnpj)) Add(PWINFO_MERCHCNPJCPF, _cpfCnpj);
        if (!String.IsNullOrWhiteSpace(_pontoDeCaptura)) Add(PWINFO_POSID, _pontoDeCaptura);
        if (!String.IsNullOrWhiteSpace(_usePinpad)) Add(PWINFO_USINGPINPAD, _usePinpad);
        if (!String.IsNullOrWhiteSpace(_pinpadPort)) Add(PWINFO_PPCOMMPORT, _pinpadPort);
        if (!String.IsNullOrWhiteSpace(_ambiente))
        {
            Add(PWINFO_DESTTCPIP, _ambiente);
            string host = AmbienteHost();
            string port = AmbientePort();
            if (!String.IsNullOrWhiteSpace(host)) Add(PWINFO_AUTIP, host);
            if (!String.IsNullOrWhiteSpace(port)) Add(PWINFO_AUTPORT, port);
        }
    }

    private static string AmbienteHost()
    {
        if (String.IsNullOrWhiteSpace(_ambiente)) return "";
        int idx = _ambiente.LastIndexOf(':');
        return idx > 0 ? _ambiente.Substring(0, idx) : _ambiente;
    }

    private static string AmbientePort()
    {
        if (String.IsNullOrWhiteSpace(_ambiente)) return "";
        int idx = _ambiente.LastIndexOf(':');
        return idx > 0 && idx < _ambiente.Length - 1 ? _ambiente.Substring(idx + 1) : "";
    }

    private static string NormalizePinpadPort(string pinpadPort)
    {
        if (String.IsNullOrWhiteSpace(pinpadPort)) return "";
        string digits = Digits(pinpadPort);
        if (String.IsNullOrWhiteSpace(digits)) return "";
        int port = Int32.Parse(digits);
        return port.ToString("00");
    }

    private static short PinpadLoop(string context)
    {
        int timeoutMs = context == "removeCard"
            ? EnvInt("PAYGO_REMOVE_CARD_TIMEOUT_MS", 30000)
            : EnvInt("PAYGO_PINPAD_TIMEOUT_MS", 270000);
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        int nothingCount = 0;
        string lastDisplay = "";

        while (true)
        {
            if (DateTime.UtcNow > deadline)
            {
                AbortPinpad();
                return PWRET_TIMEOUT;
            }

            var display = new StringBuilder(256);
            short ret = Fn<PW_iPPEventLoop_>("PW_iPPEventLoop")(display, 256);
            if (ret == PWRET_OK) return PWRET_OK;
            if (ret == PWRET_DISPLAY || ret == PWRET_NOTHING) 
            {
                string message = NormalizeDisplay(display.ToString());
                if (ret == PWRET_DISPLAY && !String.IsNullOrWhiteSpace(message) && message != lastDisplay)
                {
                    lastDisplay = message;
                    EmitEvent("PINPAD", message);
                }
                nothingCount = ret == PWRET_NOTHING ? nothingCount + 1 : 0;
                System.Threading.Thread.Sleep(nothingCount > 20 ? 500 : 150);
                continue;
            }
            return ret;
        }
    }

    private static void AbortPinpad()
    {
        try
        {
            Fn<PW_iPPAbort_>("PW_iPPAbort")();
        }
        catch
        {
        }
    }

    private static int EnvInt(string name, int fallback)
    {
        string value = Environment.GetEnvironmentVariable(name);
        int parsed;
        if (Int32.TryParse(value, out parsed) && parsed > 0) return parsed;
        return fallback;
    }

    private static bool IsAuthorizedMessage(string message)
    {
        return (message ?? "").ToUpperInvariant().Contains("AUTORIZ");
    }

    public static void SetEventId(string eventId)
    {
        _eventId = eventId ?? "";
    }

    private static void EmitEvent(string type, string message)
    {
        if (String.IsNullOrWhiteSpace(_eventId) || String.IsNullOrWhiteSpace(message)) return;
        Console.Out.WriteLine("{\"id\":\"" + Esc(_eventId) + "\",\"event\":{\"type\":\"" + Esc(type) + "\",\"message\":\"" + Esc(NormalizeDisplay(message)) + "\"}}");
        Console.Out.Flush();
    }

    private static string NormalizeDisplay(string value)
    {
        if (value == null) return "";
        return value.Replace("\r", "\n").Trim();
    }

    private static PW_GetData[] NewDataArray(short count)
    {
        var arr = new PW_GetData[count];
        for (int i = 0; i < count; i++)
        {
            arr[i].vszTextoMenu = new TextoMenu[40];
            arr[i].vszValorMenu = new ValorMenu[40];
        }
        return arr;
    }

    private static short Init(string workingDir)
    {
        if (_initialized) return PWRET_OK;
        if (String.IsNullOrWhiteSpace(workingDir)) workingDir = Path.GetDirectoryName(Environment.GetEnvironmentVariable("PAYGO_DLL_PATH") ?? "");
        short ret = Fn<PW_iInit_>("PW_iInit")(workingDir);
        if (ret == PWRET_OK) _initialized = true;
        return ret;
    }

    private static void Add(ushort info, string value)
    {
        short ret = Fn<PW_iAddParam_>("PW_iAddParam")(info, value ?? "");
        if (ret != PWRET_OK) throw new Exception("PW_iAddParam " + info + " falhou: " + ret);
    }

    private static string Result(ushort info)
    {
        var sb = new StringBuilder(4096);
        short ret = Fn<PW_iGetResult_>("PW_iGetResult")((short)info, sb, 4096);
        return ret == PWRET_OK ? sb.ToString() : "";
    }

    private static string ResultsJson(bool includeConfirmation)
    {
        var sb = new StringBuilder();
        sb.Append("{");
        Field(sb, "authCode", Result(PWINFO_AUTHCODE), false);
        Field(sb, "brand", Result(PWINFO_CARDNAME), true);
        Field(sb, "acquirer", Result(PWINFO_AUTHSYST), true);
        Field(sb, "customerReceipt", First(Result(PWINFO_RCPTCHOLDER), Result(PWINFO_RCPTFULL)), true);
        Field(sb, "merchantReceipt", First(Result(PWINFO_RCPTMERCH), Result(PWINFO_RCPTFULL)), true);
        Field(sb, "reqNum", includeConfirmation ? Result(PWINFO_REQNUM) : "", true);
        Field(sb, "locRef", includeConfirmation ? Result(PWINFO_AUTLOCREF) : "", true);
        Field(sb, "extRef", includeConfirmation ? Result(PWINFO_AUTEXTREF) : "", true);
        Field(sb, "virtMerch", includeConfirmation ? Result(PWINFO_VIRTMERCH) : "", true);
        Field(sb, "authSyst", includeConfirmation ? Result(PWINFO_AUTHSYST) : "", true);
        sb.Append("}");
        return sb.ToString();
    }

    private static string First(string a, string b)
    {
        return String.IsNullOrWhiteSpace(a) ? b : a;
    }

    private static void Field(StringBuilder sb, string name, string value, bool comma)
    {
        if (comma) sb.Append(",");
        sb.Append("\"").Append(name).Append("\":\"").Append(Esc(value)).Append("\"");
    }

    private static string Json(string status, bool approved, string message, short ret, string dataJson)
    {
        return "{\"ok\":" + (approved ? "true" : "false") +
               ",\"status\":\"" + Esc(status) + "\"" +
               ",\"ret\":" + ret +
               ",\"message\":\"" + Esc(message) + "\"" +
               ",\"data\":" + dataJson + "}";
    }

    private static string Error(string fn, short ret)
    {
        return "{\"ok\":false,\"status\":\"error\",\"function\":\"" + Esc(fn) + "\",\"ret\":" + ret + ",\"message\":\"" + Esc(Result(PWINFO_RESULTMSG)) + "\"}";
    }

    private static void Load(string dllPath)
    {
        if (_dll != IntPtr.Zero) return;
        if (!File.Exists(dllPath)) throw new FileNotFoundException("PGWebLib.dll nao encontrada", dllPath);
        _dll = LoadLibrary(dllPath);
        if (_dll == IntPtr.Zero) throw new Exception("Falha ao carregar PGWebLib.dll: " + dllPath);
    }

    private static T Fn<T>(string name)
    {
        IntPtr ptr = GetProcAddress(_dll, name);
        if (ptr == IntPtr.Zero) throw new MissingMethodException("Funcao nao encontrada na PGWebLib: " + name);
        return (T)(object)Marshal.GetDelegateForFunctionPointer(ptr, typeof(T));
    }

    private static string Esc(string value)
    {
        if (value == null) return "";
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    private static string Digits(string value)
    {
        if (value == null) return "";
        var sb = new StringBuilder();
        foreach (char c in value)
        {
            if (Char.IsDigit(c)) sb.Append(c);
        }
        return sb.ToString();
    }
}
"@

Add-Type -TypeDefinition $source

function Invoke-PayGoCommand {
  param($Command)

  $cmdAction = [string]$Command.action
  [PayGoBridge]::SetEventId([string]$Command.id)

  try {
    if ($cmdAction -eq "sale") {
      return [PayGoBridge]::Sale($DllPath, $WorkingDir, [string]$Command.saleId, [int]$Command.amountInCents, [string]$Command.method, [int]$Command.installments, [string]$Command.paygoMenuChoice, [string]$Command.captureValuesBase64)
    }

    if ($cmdAction -eq "commtest") {
      return [PayGoBridge]::CommTest($DllPath, $WorkingDir)
    }

    if ($cmdAction -eq "install") {
      return [PayGoBridge]::Operation(
        $DllPath,
        $WorkingDir,
        0x01,
        [string]$Command.cpfCnpj,
        [string]$Command.pontoDeCaptura,
        [string]$Command.ambiente,
        [string]$Command.senhaTecnica,
        [string]$Command.usePinpad,
        [string]$Command.pinpadPort
      )
    }

    if ($cmdAction -eq "admin") {
      return [PayGoBridge]::Operation(
        $DllPath,
        $WorkingDir,
        0x20,
        [string]$Command.cpfCnpj,
        [string]$Command.pontoDeCaptura,
        [string]$Command.ambiente,
        [string]$Command.senhaTecnica,
        [string]$Command.usePinpad,
        [string]$Command.pinpadPort
      )
    }

    if ($cmdAction -eq "confirm" -or $cmdAction -eq "undo") {
      if ([string]::IsNullOrWhiteSpace([string]$Command.confirmationJsonBase64)) {
        throw "confirmationJsonBase64 e obrigatorio para $cmdAction"
      }

      $confirmation = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$Command.confirmationJsonBase64)) | ConvertFrom-Json
      if ($cmdAction -eq "confirm") {
        return [PayGoBridge]::Confirm($DllPath, $WorkingDir, $confirmation.reqNum, $confirmation.locRef, $confirmation.extRef, $confirmation.virtMerch, $confirmation.authSyst)
      }

      return [PayGoBridge]::Undo($DllPath, $WorkingDir, $confirmation.reqNum, $confirmation.locRef, $confirmation.extRef, $confirmation.virtMerch, $confirmation.authSyst)
    }

    throw "Action invalida no host PayGo: $cmdAction"
  } finally {
    [PayGoBridge]::SetEventId("")
  }
}

function Write-HostResponse {
  param($Response)
  [Console]::Out.WriteLine(($Response | ConvertTo-Json -Compress -Depth 8))
  [Console]::Out.Flush()
}

if ($Action -eq "host") {
  try {
    $readyPayload = [PayGoBridge]::CommTest($DllPath, $WorkingDir) | ConvertFrom-Json
    if (-not $readyPayload.ok) {
      $detail = if ($readyPayload.function -and $null -ne $readyPayload.ret) {
        "$($readyPayload.function) ret=$($readyPayload.ret): $($readyPayload.message)"
      } else {
        $readyPayload.message
      }
      Write-HostResponse @{ id = "__ready"; error = $detail; payload = $readyPayload }
      exit 1
    }

    Write-HostResponse @{ id = "__ready"; payload = @{ ok = $true; status = "ready"; message = "PayGo host inicializado" } }

    while (($line = [Console]::In.ReadLine()) -ne $null) {
      if ([string]::IsNullOrWhiteSpace($line)) {
        continue
      }

      $command = $null
      try {
        $command = $line | ConvertFrom-Json
        $resultJson = Invoke-PayGoCommand $command
        $payload = $resultJson | ConvertFrom-Json
        Write-HostResponse @{ id = $command.id; payload = $payload }
      } catch {
        $message = $_.Exception.Message
        $id = if ($command -and $command.id) { $command.id } else { $null }
        Write-HostResponse @{ id = $id; error = $message; payload = @{ ok = $false; status = "error"; message = $message } }
      }
    }
  } catch {
    Write-HostResponse @{ id = "__ready"; error = $_.Exception.Message; payload = @{ ok = $false; status = "error"; message = $_.Exception.Message } }
    exit 1
  }

  exit
}

if ($Action -eq "sale") {
  [PayGoBridge]::Sale($DllPath, $WorkingDir, $SaleId, $AmountInCents, $Method, $Installments, $PaygoMenuChoice, $CaptureValuesBase64)
  exit
}

if ($Action -eq "commtest") {
  [PayGoBridge]::CommTest($DllPath, $WorkingDir)
  exit
}

if (-not [string]::IsNullOrWhiteSpace($CpfCnpj)) {
  [Environment]::SetEnvironmentVariable("CPFCNPJ", $CpfCnpj, "Process")
}
if (-not [string]::IsNullOrWhiteSpace($PontoDeCaptura)) {
  [Environment]::SetEnvironmentVariable("PontoDeCaptura", $PontoDeCaptura, "Process")
}
if (-not [string]::IsNullOrWhiteSpace($Ambiente)) {
  [Environment]::SetEnvironmentVariable("AmbienteCPAY", $Ambiente, "Process")
}

if ($Action -eq "install") {
  [PayGoBridge]::Operation($DllPath, $WorkingDir, 0x01, $CpfCnpj, $PontoDeCaptura, $Ambiente, $SenhaTecnica, $UsePinpad, $PinpadPort)
  exit
}

if ($Action -eq "admin") {
  [PayGoBridge]::Operation($DllPath, $WorkingDir, 0x20, $CpfCnpj, $PontoDeCaptura, $Ambiente, $SenhaTecnica, $UsePinpad, $PinpadPort)
  exit
}

if ([string]::IsNullOrWhiteSpace($ConfirmationJsonBase64)) {
  throw "ConfirmationJsonBase64 e obrigatorio para $Action"
}

$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ConfirmationJsonBase64)) | ConvertFrom-Json

if ($Action -eq "confirm") {
  [PayGoBridge]::Confirm($DllPath, $WorkingDir, $json.reqNum, $json.locRef, $json.extRef, $json.virtMerch, $json.authSyst)
  exit
}

if ($Action -eq "undo") {
  [PayGoBridge]::Undo($DllPath, $WorkingDir, $json.reqNum, $json.locRef, $json.extRef, $json.virtMerch, $json.authSyst)
  exit
}
