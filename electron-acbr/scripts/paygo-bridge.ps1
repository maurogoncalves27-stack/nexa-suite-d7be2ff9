param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("sale", "confirm", "undo", "cleanup", "commtest", "install", "admin", "host", "pending")]
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
  [string] $QrDisplayPreference = "",
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
    private const short BRIDGE_ADMIN_OPERATION_SELECTED = 2;
    private const short BRIDGE_ADMIN_OPERATION_FINISHED = 3;

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
    private const ushort PWINFO_TRNDATE = 0x57;
    private const ushort PWINFO_TRNORIGAMNT = 0x60;
    private const ushort PWINFO_TRNTIME = 0x73;
    private const ushort PWINFO_TRNORIGLOCREF = 0x78;
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
    private const ushort PWINFO_AUTHPOSQRCODE = 0x1F77;
    private const ushort PWINFO_USINGPINPAD = 0x7F01;
    private const ushort PWINFO_PPCOMMPORT = 0x7F02;
    private const ushort PWINFO_PNDAUTHSYST = 0x7F05;
    private const ushort PWINFO_PNDVIRTMERCH = 0x7F06;
    private const ushort PWINFO_PNDREQNUM = 0x7F07;
    private const ushort PWINFO_PNDAUTLOCREF = 0x7F08;
    private const ushort PWINFO_PNDAUTEXTREF = 0x7F09;

    private const uint PWCNF_CNF_AUTO = 0x00000121;
    private const uint PWCNF_CNF_MANU_AUT = 0x00003221;
    private const uint PWCNF_REV_MANU_AUT = 0x00003231;
    private const uint PWCNF_REV_DISP_AUT = 0x00023131;

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
    private static string _qrDisplayPreference = "";
    private static string _eventId = "";
    private static string _lastQrEmitted = "";
    private static bool _interactive = false;
    private static byte _currentOperation = 0;
    private static byte _selectedAdminOperation = 0;
    private static int _captureSeq = 0;
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

    public static string Sale(string dllPath, string workingDir, string saleId, int amountInCents, string method, int installments, string paygoMenuChoice, string captureValuesBase64, string qrDisplayPreference)
    {
        try
        {
            _paygoMenuChoice = paygoMenuChoice ?? "";
            _captureValues = ParseCaptureValues(captureValuesBase64);
            _qrDisplayPreference = qrDisplayPreference ?? "";
            _lastQrEmitted = "";
            _interactive = true;
            _captureSeq = 0;
            _currentOperation = PWOPER_SALE;
            EmitEvent("INFO", "Iniciando venda PayGo TEF saleId=" + saleId + " valorCentavos=" + amountInCents + " metodo=" + method);

            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            ret = Fn<PW_iNewTransac_>("PW_iNewTransac")(PWOPER_SALE);
            if (ret != PWRET_OK) return Error("PW_iNewTransac", ret);

            Add(PWINFO_AUTNAME, "PDV");
            Add(PWINFO_AUTVER, "1.0.0");
            Add(PWINFO_AUTDEV, "PayGo");
            Add(PWINFO_AUTCAP, "452"); // Alinhado com referencia (display/vias/remocao de cartao)
            Add(PWINFO_DSPQRPREF, QrDisplayPreference());
            EmitEvent("INFO", "Preferencia QR PayGo=" + QrDisplayPreference() + " (1=pinpad, 2=checkout/PC)");
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
            else if (method == "PIX" || method == "PIX_TEF")
            {
                // Pix via PayGo Integrado: PAYMNTTYPE=8 ativa o fluxo Pix
                // (gera BR Code via PSP do PdC). Sem isso, a DLL trata a
                // transação como cartao e o PIX nunca é solicitado, o que
                // explica a tela branca no PPC930.
                Add(PWINFO_PAYMNTTYPE, "8");
                EmitEvent("INFO", "Fluxo PIX habilitado (PWINFO_PAYMNTTYPE=8)");
            }

            ret = ExecLoop();
            if (ret == BRIDGE_AUTHORIZED_AFTER_REMOVE_TIMEOUT)
            {
                EmitEvent("APPROVED", "Transacao autorizada. Finalizando fluxo do pinpad.");
                return Json("approved", true, First(Result(PWINFO_RESULTMSG), "Transacao autorizada"), PWRET_OK, ResultsJson(true));
            }

            if (ret == PWRET_FROMHOSTPENDTRN)
            {
                return Json("pendingConfirmation", false, "Existe transacao pendente de confirmacao no PayGo", ret, PendingResultsJson());
            }

            if (ret != PWRET_OK)
            {
                string resultMessage = Result(PWINFO_RESULTMSG);
                if (ret == -2582)
                {
                    EmitEvent("ERROR", "Queda de conexao com o host PayGo. Transacao sem autorizacao.");
                }

                if (ShouldReturnPending(ret, resultMessage))
                {
                    EmitEvent("INFO", "PayGo indicou transacao pendente apos falha de comunicacao");
                    return Json("pendingConfirmation", false, First(resultMessage, "Existe transacao pendente de confirmacao no PayGo"), ret, PendingResultsJson());
                }

                if (ret == PWRET_TIMEOUT && IsAuthorizedMessage(resultMessage))
                {
                    AbortPinpad();
                    EmitEvent("APPROVED", "Transacao autorizada. Timeout apenas na finalizacao do pinpad.");
                    return Json("approved", true, resultMessage, ret, ResultsJson(true));
                }

                EmitEvent("DENIED", First(resultMessage, "Transacao nao aprovada pelo PayGo"));
                return Json("denied", false, resultMessage, ret, ResultsJson(true));
            }

            EmitEvent("APPROVED", "Transacao autorizada pelo PayGo");
            return Json("approved", true, Result(PWINFO_RESULTMSG), ret, ResultsJson(true));
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
        finally
        {
            _interactive = false;
        }
    }

    public static string Operation(string dllPath, string workingDir, byte operation, string cpfCnpj, string pontoDeCaptura, string ambiente, string senhaTecnica, string usePinpad, string pinpadPort, string paygoMenuChoice, bool interactive)
    {
        try
        {
            _cpfCnpj = Digits(cpfCnpj);
            _pontoDeCaptura = pontoDeCaptura ?? "";
            _ambiente = ambiente ?? "";
            _senhaTecnica = senhaTecnica ?? "";
            _paygoMenuChoice = paygoMenuChoice ?? "";
            _usePinpad = String.IsNullOrWhiteSpace(usePinpad) ? "" : usePinpad;
            _pinpadPort = NormalizePinpadPort(pinpadPort);
            _interactive = interactive;
            _currentOperation = operation;
            _selectedAdminOperation = 0;
            _captureSeq = 0;

            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            ret = ExecuteOperation(operation);
            if (ret == BRIDGE_ADMIN_OPERATION_SELECTED)
            {
                byte selectedOperation = _selectedAdminOperation;
                EmitEvent("INFO", "Executando operacao selecionada no menu administrativo: " + OperationName(selectedOperation));
                ret = ExecuteOperation(selectedOperation);
            }

            if (ret == BRIDGE_ADMIN_OPERATION_FINISHED)
            {
                EmitEvent("INFO", "Operacao administrativa finalizada pela PayGo");
                _interactive = false;
                return Json("ok", true, "Operacao PayGo concluida", PWRET_OK, ResultsJson(true));
            }

            if (ret != PWRET_OK) return Error("PW_iExecTransac", ret);

            // Pendencia: espelha Fluxos.FluxoConfirmacaoPendencia da demo oficial.
            // Apos ADMIN, se ficou pendencia confirma automaticamente para nao
            // travar a proxima operacao com ERRO DE AUTENTICACAO DO PONTO DE CAPTURA.
            TryConfirmPendency();

            // Se a transacao corrente exige confirmacao, confirma agora.
            if (RequiresConfirmation())
            {
                short cret = ConfirmCurrent(PWCNF_CNF_AUTO);
                if (cret != PWRET_OK) EmitEvent("INFO", "PW_iConfirmation pos-ADMIN ret=" + cret);
            }

            _interactive = false;
            return Json("ok", true, "Operacao PayGo concluida", ret, ResultsJson(true));
        }
        catch (Exception ex)
        {
            _interactive = false;
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    private static short ExecuteOperation(byte operation)
    {
        _currentOperation = operation;
        short ret = Fn<PW_iNewTransac_>("PW_iNewTransac")(operation);
        if (ret != PWRET_OK) return ret;

        // Espelha demo oficial Setis (MainWindow.NewTransacExecute): para ADMIN/SALE
        // apenas estes 5 params sao adicionados. CPFCNPJ/PontoDeCaptura/Ambiente
        // sao lidos pela DLL via env vars setadas durante a instalacao do PdC.
        Add(PWINFO_AUTNAME, "PDV");
        Add(PWINFO_AUTVER, "1.0.0");
        Add(PWINFO_AUTDEV, "PayGo");
        Add(PWINFO_AUTCAP, "452");
        Add(PWINFO_DSPQRPREF, "2");

        // Modo nao-interativo (install legado): mantem behavior antigo com params extras.
        if (!_interactive) AddActivationParams();

        return ExecLoop();
    }

    private static void TryConfirmPendency()
    {
        try
        {
            string pndReqNum = Result(PWINFO_PNDREQNUM);
            if (String.IsNullOrWhiteSpace(pndReqNum)) return;
            EmitEvent("INFO", "Pendencia detectada apos ADMIN — confirmando automaticamente (PWCNF_CNF_AUTO).");
            short ret = Fn<PW_iConfirmation_>("PW_iConfirmation")(
                PWCNF_CNF_AUTO,
                pndReqNum,
                Result(PWINFO_PNDAUTLOCREF),
                Result(PWINFO_PNDAUTEXTREF),
                Result(PWINFO_PNDVIRTMERCH),
                Result(PWINFO_PNDAUTHSYST)
            );
            EmitEvent("INFO", "Confirmacao de pendencia ret=" + ret);
        }
        catch (Exception ex)
        {
            EmitEvent("INFO", "Falha confirmando pendencia: " + ex.Message);
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

    public static string ProbePending(string dllPath, string workingDir)
    {
        try
        {
            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK && !ShouldReturnPending(ret, Result(PWINFO_RESULTMSG)))
                return Error("PW_iInit", ret);

            if (HasPendingTransaction() || HasConfirmationTuple())
            {
                return Json("pendingConfirmation", false, First(Result(PWINFO_RESULTMSG), "Existe transacao pendente de confirmacao no PayGo"), ret, PendingResultsJson());
            }

            return "{\"ok\":true,\"status\":\"noPending\",\"message\":\"Sem pendencia PayGo\"}";
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
    }

    public static string Confirm(string dllPath, string workingDir, string reqNum, string locRef, string extRef, string virtMerch, string authSyst)
    {
        return Confirmation(dllPath, workingDir, PWCNF_CNF_MANU_AUT, reqNum, locRef, extRef, virtMerch, authSyst);
    }

    public static string Undo(string dllPath, string workingDir, string reqNum, string locRef, string extRef, string virtMerch, string authSyst, string undoReason)
    {
        uint confirmation = String.Equals(undoReason, "dispensingFailure", StringComparison.OrdinalIgnoreCase)
            ? PWCNF_REV_DISP_AUT
            : PWCNF_REV_MANU_AUT;
        return Confirmation(dllPath, workingDir, confirmation, reqNum, locRef, extRef, virtMerch, authSyst);
    }

    // Cleanup: força desfazimento de QUALQUER pendência presa na PGWebLib
    // (situação típica após timeout de PIX, queda de host, ou venda abortada
    // antes do PW_iConfirmation). Chamado tanto por rota explícita
    // (/tef/limpar-pendencia) quanto pelo agente JS no início de cada venda
    // quando o estado anterior ficou "timeout".
    public static string Cleanup(string dllPath, string workingDir)
    {
        try
        {
            Load(dllPath);
            short ret = Init(workingDir);
            if (ret != PWRET_OK) return Error("PW_iInit", ret);

            EmitEvent("INFO", "Cleanup: forcando PW_iConfirmation(PWCNF_REV_MANU_AUT) com params vazios");
            short cnfRet = Fn<PW_iConfirmation_>("PW_iConfirmation")(PWCNF_REV_MANU_AUT, "", "", "", "", "");
            if (cnfRet != PWRET_OK)
            {
                EmitEvent("INFO", "Cleanup: PW_iConfirmation ret=" + cnfRet + " (nenhuma pendencia ou ja limpa)");
                // Não tratamos como erro fatal — se não havia pendência, a DLL
                // retorna algo != 0 e tudo bem, a próxima venda funciona.
                return "{\"ok\":true,\"status\":\"cleanup\",\"message\":\"Sem pendencia a limpar (ret=" + cnfRet + ")\",\"ret\":" + cnfRet + "}";
            }

            EmitEvent("CONFIRMED", "Cleanup: pendencia anterior desfeita com sucesso");
            return "{\"ok\":true,\"status\":\"cleanup\",\"message\":\"Pendencia anterior desfeita\",\"ret\":0}";
        }
        catch (Exception ex)
        {
            return "{\"ok\":false,\"status\":\"error\",\"message\":\"" + Esc(ex.Message) + "\"}";
        }
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
            EmitEvent("CONFIRMED", IsUndoConfirmation(confirmation) ? "Desfazimento enviado ao PayGo" : "Confirmacao enviada ao PayGo");
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
            EmitEvent("INFO", "PW_iExecTransac ret=" + execRet + " capturas=" + count);

            // Leitura proativa do BR Code: quando QR pref=2 (PC) a DLL pode nao
            // disparar PWDAT_DSPQRCODE, mas o QR ja fica disponivel em
            // PWINFO_AUTHPOSQRCODE assim que o PayGo o gera. Emitimos uma unica
            // vez para o agente entregar via /sale/status.
            try
            {
                string qrPoll = Result(PWINFO_AUTHPOSQRCODE);
                if (!String.IsNullOrEmpty(qrPoll) && qrPoll != _lastQrEmitted)
                {
                    _lastQrEmitted = qrPoll;
                    EmitEvent("INFO", "QR Code lido proativamente (len=" + qrPoll.Length + ")");
                    EmitEvent("QRCODE", qrPoll);
                }
            } catch { }

            if (execRet == PWRET_MOREDATA || execRet == PWRET_NOTHING) continue;
            return execRet;
        }
    }

    private static short HandleData(PW_GetData data, ushort index)
    {
        short ret;
            EmitEvent("INFO", "Captura PayGo tipo=" + data.bTipoDeDado + " id=" + FormatIdentifier(data.wIdentificador) + " prompt=" + (data.szPrompt ?? "") + " valorInicialLen=" + ((data.szValorInicial ?? "").Length) + " aceitaNulo=" + data.bAceitaNulo);
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
                // Conforme guia PayGo: sinalizar tratamento do display no checkout
                // com string vazia, sem reenviar o conteúdo.
                return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, "");
            case PWDAT_DSPQRCODE:
                {
                    // Alinhado a demo oficial C# (Fluxos.FluxoDspQRCode):
                    // o BR Code NAO vem em szValorInicial — tem que ser lido
                    // via PW_iGetResult(PWINFO_AUTHPOSQRCODE=0x1F77). Depois
                    // respondemos com PW_iAddParam(wIdentificador, "").
                    string qr = Result(PWINFO_AUTHPOSQRCODE);
                    EmitEvent("INFO", "PayGo solicitou exibicao de QR Code (id=" + FormatIdentifier(data.wIdentificador) + " len=" + (qr ?? "").Length + ")");
                    EmitEvent("INFO", "BR Code PIX recebido para saleId atual; use este QR no checkout se o pinpad nao exibir.");
                    if (!String.IsNullOrEmpty(qr)) EmitEvent("QRCODE", qr);
                    return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, "");
                }
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
                EmitEvent("PINPAD", IsNoCardAdministrativeOperation(_currentOperation) ? "Finalizando operacao administrativa no pinpad" : "Remova o cartao do pinpad");
                ret = Fn<PW_iPPRemoveCard_>("PW_iPPRemoveCard")();
                if (ret != PWRET_OK) return ret;

                if (IsNoCardAdministrativeOperation(_currentOperation))
                {
                    EmitEvent("INFO", "PayGo solicitou remocao/finalizacao de pinpad em operacao sem cartao; encerrando fluxo administrativo");
                    return BRIDGE_ADMIN_OPERATION_FINISHED;
                }

                ret = PinpadLoop("removeCard");
                if (ret == PWRET_TIMEOUT && _currentOperation != PWOPER_SALE)
                {
                    AbortPinpad();
                    EmitEvent("INFO", "Timeout apenas na finalizacao do pinpad; encerrando operacao administrativa");
                    return BRIDGE_ADMIN_OPERATION_FINISHED;
                }
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
            case 0: // PWDAT_NONE / slot vazio retornado pela DLL (count alocado > capturas reais)
                return PWRET_OK;
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

        // Modo interativo (ADMIN): solicita escolha ao operador via CAPTURE_REQUEST e
        // bloqueia ate receber capture_response na stdin do host.
        if (_interactive)
        {
            string menuJson = BuildCaptureRequestJson(data, "MENU");
            EmitRawCapture(menuJson);
            string answer = WaitForCaptureResponse(data.wIdentificador);
            if (answer == null)
            {
                EmitEvent("INFO", "Captura de menu cancelada pelo operador");
                return PWRET_CANCEL;
            }
            // operador pode mandar o valor literal OU o numero do item (1..n) OU o texto.
            string normalized = NormalizeChoice(answer);
            string value = null;
            string matchedText = "";
            for (int i = 0; i < data.bNumOpcoesMenu; i++)
            {
                string text = data.vszTextoMenu != null && i < data.vszTextoMenu.Length ? data.vszTextoMenu[i].szTextoMenu : "";
                string opt = data.vszValorMenu != null && i < data.vszValorMenu.Length ? data.vszValorMenu[i].szValorMenu : "";
                if (NormalizeChoice(opt) == normalized || NormalizeChoice(text) == normalized || (i + 1).ToString() == normalized)
                {
                    value = String.IsNullOrWhiteSpace(opt) ? text : opt;
                    matchedText = text;
                    break;
                }
            }
            if (value == null) value = answer; // confia no que o front mandou
            EmitEvent("INFO", "Opcao escolhida pelo operador: " + value);

            // Em ADMIN interativo, espelha a referencia: menu retorna um PWOPER e
            // o bridge deve iniciar nova PW_iNewTransac com a operacao selecionada.
            if (_currentOperation == PWOPER_ADMIN)
            {
                byte selectedOperation;
                if (!TryResolveAdminOperation(value, matchedText, out selectedOperation))
                {
                    throw new Exception("Opcao administrativa sem codigo PWOPER valido: " + value);
                }

                _selectedAdminOperation = selectedOperation;
                EmitEvent("INFO", "Operacao administrativa selecionada: " + OperationName(selectedOperation));
                return BRIDGE_ADMIN_OPERATION_SELECTED;
            }

            // Alinhado com a referencia: ao selecionar uma rede PIX no menu da
            // transacao de venda, ajustar parametros para fluxo PIX (QR no pinpad).
            string normalizedValue = NormalizeChoice(value);
            string normalizedText = NormalizeChoice(matchedText);
            if (normalizedValue.Contains("PIX") || normalizedText.Contains("PIX"))
            {
                Add(PWINFO_AUTCAP, "399");
                Add(PWINFO_DSPQRPREF, "1");
                Add(PWINFO_PAYMNTTYPE, "8");
                EmitEvent("INFO", "Fluxo PIX selecionado; QR Code preferencialmente no pinpad");
            }

            return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, value);
        }

        if (String.IsNullOrWhiteSpace(_paygoMenuChoice))
        {
            // Regra PayGo: se houver apenas 1 opcao e item inicial valido, pode
            // auto-selecionar sem interacao do operador.
            if (data.bNumOpcoesMenu == 1)
            {
                string oneText = data.vszTextoMenu != null && data.vszTextoMenu.Length > 0 ? data.vszTextoMenu[0].szTextoMenu : "";
                string oneVal = data.vszValorMenu != null && data.vszValorMenu.Length > 0 ? data.vszValorMenu[0].szValorMenu : "";
                string autoValue = String.IsNullOrWhiteSpace(oneVal) ? oneText : oneVal;
                EmitEvent("INFO", "Menu com opcao unica, selecionando automaticamente: " + (String.IsNullOrWhiteSpace(oneText) ? autoValue : oneText));
                return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, autoValue ?? "");
            }

            if (data.bItemInicial < data.bNumOpcoesMenu)
            {
                int idx = data.bItemInicial;
                string defaultText = data.vszTextoMenu != null && idx < data.vszTextoMenu.Length ? data.vszTextoMenu[idx].szTextoMenu : "";
                string defaultVal = data.vszValorMenu != null && idx < data.vszValorMenu.Length ? data.vszValorMenu[idx].szValorMenu : "";
                string autoDefault = String.IsNullOrWhiteSpace(defaultVal) ? defaultText : defaultVal;
                if (!String.IsNullOrWhiteSpace(autoDefault))
                {
                    EmitEvent("INFO", "Menu sem escolha explicita; usando item inicial padrao: " + (String.IsNullOrWhiteSpace(defaultText) ? autoDefault : defaultText));
                    return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, autoDefault);
                }
            }

            EmitEvent("INFO", "PayGo solicitou selecao de menu: " + MenuOptions(data));
            throw new Exception("PayGo solicitou menu sem opcao selecionada. Opcoes: " + MenuOptions(data));
        }

        EmitEvent("INFO", "PayGo solicitou selecao de menu: " + MenuOptions(data));
        string normalizedChoice = NormalizeChoice(_paygoMenuChoice);
        string staticValue = "";

        for (int i = 0; i < data.bNumOpcoesMenu; i++)
        {
            string text = data.vszTextoMenu != null && i < data.vszTextoMenu.Length ? data.vszTextoMenu[i].szTextoMenu : "";
            string optionValue = data.vszValorMenu != null && i < data.vszValorMenu.Length ? data.vszValorMenu[i].szValorMenu : "";

            if (NormalizeChoice(text) == normalizedChoice || NormalizeChoice(optionValue) == normalizedChoice)
            {
                staticValue = optionValue;
                if (String.IsNullOrWhiteSpace(staticValue)) staticValue = text;
                break;
            }
        }

        if (String.IsNullOrWhiteSpace(staticValue))
        {
            throw new Exception("Opcao de menu PayGo nao encontrada: " + _paygoMenuChoice + ". Opcoes: " + MenuOptions(data));
        }

        EmitEvent("INFO", "Opcao PayGo selecionada: " + _paygoMenuChoice);
        short ret = Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, staticValue ?? "");
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

    private static bool TryParseOperationCode(string value, out byte operation)
    {
        operation = 0;
        if (String.IsNullOrWhiteSpace(value)) return false;

        string normalized = value.Trim();
        if (normalized.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            return Byte.TryParse(normalized.Substring(2), System.Globalization.NumberStyles.HexNumber, System.Globalization.CultureInfo.InvariantCulture, out operation);
        }

        if (normalized.EndsWith("h", StringComparison.OrdinalIgnoreCase))
        {
            return Byte.TryParse(normalized.Substring(0, normalized.Length - 1), System.Globalization.NumberStyles.HexNumber, System.Globalization.CultureInfo.InvariantCulture, out operation);
        }

        return Byte.TryParse(normalized, out operation);
    }

    private static bool TryResolveAdminOperation(string value, string text, out byte operation)
    {
        operation = 0;

        if (TryParseOperationCode(value, out operation) && IsSupportedOperation(operation))
        {
            return true;
        }

        if (TryParseOperationCode(text, out operation) && IsSupportedOperation(operation))
        {
            return true;
        }

        string normalizedValue = NormalizeChoice(value);
        string normalizedText = NormalizeChoice(text);

        if (TryMapAdminOperationAlias(normalizedValue, out operation)) return true;
        if (TryMapAdminOperationAlias(normalizedText, out operation)) return true;

        return false;
    }

    private static bool TryMapAdminOperationAlias(string normalized, out byte operation)
    {
        operation = 0;
        if (String.IsNullOrWhiteSpace(normalized)) return false;

        // Compatibilidade com menus que retornam rótulos textuais em vez de código.
        if (normalized.Contains("INSTAL")) { operation = 0x01; return true; }       // PWOPER_INSTALL
        if (normalized.Contains("CONFIG")) { operation = 0xFD; return true; }       // PWOPER_CONFIG
        if (normalized.Contains("MANUTEN")) { operation = 0xFE; return true; }      // PWOPER_MAINTENANCE
        if (normalized.Contains("VERSAO")) { operation = 0xFC; return true; }       // PWOPER_VERSION
        if (normalized.Contains("MOSTRA") && normalized.Contains("PDC")) { operation = 0xFB; return true; }    // PWOPER_SHOWPDC
        if (normalized.Contains("EXIB") && normalized.Contains("PDC")) { operation = 0xFB; return true; }      // PWOPER_SHOWPDC
        if (normalized.Contains("TESTE") && normalized.Contains("COM")) { operation = 0x14; return true; }     // PWOPER_COMMTEST
        if (normalized.Contains("COMUM")) { operation = 0xFA; return true; }       // PWOPER_COMMONDATA
        if (normalized.Contains("PARAM")) { operation = 0x02; return true; }       // PWOPER_PARAMUPD
        if (normalized.Contains("LOCAL") && normalized.Contains("MANUT")) { operation = 0x2C; return true; }   // PWOPER_LOCALMAINT
        if (normalized.Contains("ESTAT")) { operation = 0x40; return true; }       // PWOPER_STATISTICS

        return false;
    }

    private static bool IsSupportedOperation(byte operation)
    {
        switch (operation)
        {
            case 0x00:
            case 0x01:
            case 0x02:
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17:
            case 0x20:
            case 0x21:
            case 0x22:
            case 0x23:
            case 0x24:
            case 0x25:
            case 0x26:
            case 0x27:
            case 0x28:
            case 0x29:
            case 0x2A:
            case 0x2B:
            case 0x2C:
            case 0x2D:
            case 0x2E:
            case 0x2F:
            case 0x30:
            case 0x31:
            case 0x32:
            case 0x33:
            case 0x34:
            case 0x35:
            case 0x36:
            case 0x37:
            case 0x38:
            case 0x39:
            case 0x40:
            case 0x41:
            case 0x44:
            case 0x45:
            case 0x46:
            case 0x48:
            case 0x49:
            case 0x4A:
            case 0x4B:
            case 0x4C:
            case 0x4E:
            case 0xF0:
            case 0xFA:
            case 0xFB:
            case 0xFC:
            case 0xFD:
            case 0xFE:
                return true;
            default:
                return false;
        }
    }

    private static bool IsNoCardAdministrativeOperation(byte operation)
    {
        switch (operation)
        {
            case 0x00:
            case 0x02:
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15:
            case 0x16:
            case 0x17:
            case 0x20:
            case 0x40:
            case 0x49:
            case 0x4A:
            case 0x4B:
            case 0xF1:
            case 0xFA:
            case 0xFB:
            case 0xFC:
            case 0xFD:
            case 0xFE:
                return true;
            default:
                return false;
        }
    }

    private static string OperationName(byte operation)
    {
        switch (operation)
        {
            case 0x00: return "PWOPER_NULL (00h)";
            case 0x01: return "PWOPER_INSTALL (01h)";
            case 0x02: return "PWOPER_PARAMUPD (02h)";
            case 0x10: return "PWOPER_REPRINT (10h)";
            case 0x11: return "PWOPER_RPTTRUNC (11h)";
            case 0x12: return "PWOPER_RPTDETAIL (12h)";
            case 0x13: return "PWOPER_REPRNTNTRANSACTION (13h)";
            case 0x14: return "PWOPER_COMMTEST (14h)";
            case 0x15: return "PWOPER_RPTSUMMARY (15h)";
            case 0x16: return "PWOPER_TRANSACINQ (16h)";
            case 0x17: return "PWOPER_ROUTINGINQ (17h)";
            case 0x20: return "PWOPER_ADMIN (20h)";
            case 0x21: return "PWOPER_SALE (21h)";
            case 0x22: return "PWOPER_SALEVOID (22h)";
            case 0x23: return "PWOPER_PREPAID (23h)";
            case 0x24: return "PWOPER_CHECKINQ (24h)";
            case 0x25: return "PWOPER_RETBALINQ (25h)";
            case 0x26: return "PWOPER_CRDBALINQ (26h)";
            case 0x27: return "PWOPER_INITIALIZ (27h)";
            case 0x28: return "PWOPER_SETTLEMNT (28h)";
            case 0x29: return "PWOPER_PREAUTH (29h)";
            case 0x2A: return "PWOPER_PREAUTVOID (2Ah)";
            case 0x2B: return "PWOPER_CASHWDRWL (2Bh)";
            case 0x2C: return "PWOPER_LOCALMAINT (2Ch)";
            case 0x2D: return "PWOPER_FINANCINQ (2Dh)";
            case 0x2E: return "PWOPER_ADDRVERIF (2Eh)";
            case 0x2F: return "PWOPER_SALEPRE (2Fh)";
            case 0x30: return "PWOPER_LOYCREDIT (30h)";
            case 0x31: return "PWOPER_LOYCREDVOID (31h)";
            case 0x32: return "PWOPER_LOYDEBIT (32h)";
            case 0x33: return "PWOPER_LOYDEBVOID (33h)";
            case 0x34: return "PWOPER_BILLPAYMENT (34h)";
            case 0x35: return "PWOPER_DOCPAYMENTQ (35h)";
            case 0x36: return "PWOPER_LOGON (36h)";
            case 0x37: return "PWOPER_SRCHPREAUTH (37h)";
            case 0x38: return "PWOPER_ADDPREAUTH (38h)";
            case 0x39: return "PWOPER_VOID (39h)";
            case 0x40: return "PWOPER_STATISTICS (40h)";
            case 0x41: return "PWOPER_CARDPAYMENT (41h)";
            case 0x44: return "PWOPER_CARDPAYMENTVOID (44h)";
            case 0x45: return "PWOPER_CASHWDRWLVOID (45h)";
            case 0x46: return "PWOPER_CARDUNLOCK (46h)";
            case 0x48: return "PWOPER_UPDATEDCHIP (48h)";
            case 0x49: return "PWOPER_RPTPROMOTIONAL (49h)";
            case 0x4A: return "PWOPER_SALESUMMARY (4Ah)";
            case 0x4B: return "PWOPER_STATISTICSAUTHORIZER (4Bh)";
            case 0x4C: return "PWOPER_OTHERADMIN (4Ch)";
            case 0x4E: return "PWOPER_BILLPAYMENTVOID (4Eh)";
            case 0xF0: return "PWOPER_TSTKEY (F0h)";
            case 0xFA: return "PWOPER_COMMONDATA (FAh)";
            case 0xFB: return "PWOPER_SHOWPDC (FBh)";
            case 0xFC: return "PWOPER_VERSION (FCh)";
            case 0xFD: return "PWOPER_CONFIG (FDh)";
            case 0xFE: return "PWOPER_MAINTENANCE (FEh)";
            default: return "PWOPER_" + operation.ToString("X2") + "h";
        }
    }

    private static short AddTypedValue(PW_GetData data, string captureAlias)
    {
        if (_interactive)
        {
            string js = BuildCaptureRequestJson(data, captureAlias == "BARCODE" ? "BARCODE" : "TYPED");
            EmitRawCapture(js);
            string answer = WaitForCaptureResponse(data.wIdentificador);
            if (answer == null)
            {
                EmitEvent("INFO", "Captura digitada cancelada pelo operador");
                return PWRET_CANCEL;
            }
            string normalizedAnswer = NormalizeInteractiveCaptureValue(data.wIdentificador, answer);
            EmitEvent("INFO", "Captura informada para " + FormatIdentifier(data.wIdentificador) + " valor=" + normalizedAnswer);
            return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, normalizedAnswer);
        }

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
        if (_interactive)
        {
            string js = BuildCaptureRequestJson(data, "USERAUTH");
            EmitRawCapture(js);
            string answer = WaitForCaptureResponse(data.wIdentificador);
            if (answer == null)
            {
                EmitEvent("INFO", "Captura de senha cancelada pelo operador");
                return PWRET_CANCEL;
            }
            return Fn<PW_iAddParam_>("PW_iAddParam")(data.wIdentificador, answer);
        }

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

    // Constroi o payload JSON do CAPTURE_REQUEST que e enviado pro front via stdout.
    private static string BuildCaptureRequestJson(PW_GetData data, string captureType)
    {
        _captureSeq++;
        var sb = new StringBuilder();
        sb.Append("{");
        sb.Append("\"type\":\"CAPTURE\",");
        sb.Append("\"captureType\":\"").Append(Esc(captureType)).Append("\",");
        sb.Append("\"identificador\":").Append((int)data.wIdentificador).Append(",");
        sb.Append("\"tipo\":").Append((int)data.bTipoDeDado).Append(",");
        sb.Append("\"seq\":").Append(_captureSeq).Append(",");
        sb.Append("\"prompt\":\"").Append(Esc(data.szPrompt ?? "")).Append("\",");
        sb.Append("\"mascara\":\"").Append(Esc(data.szMascaraDeCaptura ?? "")).Append("\",");
        sb.Append("\"tamMin\":").Append((int)data.bTamanhoMinimo).Append(",");
        sb.Append("\"tamMax\":").Append((int)data.bTamanhoMaximo).Append(",");
        sb.Append("\"ocultar\":").Append(data.bOcultarDadosDigitados == 1 ? "true" : "false").Append(",");
        sb.Append("\"aceitaNulo\":").Append(data.bAceitaNulo == 1 ? "true" : "false").Append(",");
        sb.Append("\"valorInicial\":\"").Append(Esc(data.szValorInicial ?? "")).Append("\",");
        sb.Append("\"options\":[");
        if (data.bTipoDeDado == PWDAT_MENU)
        {
            for (int i = 0; i < data.bNumOpcoesMenu; i++)
            {
                if (i > 0) sb.Append(",");
                string text = data.vszTextoMenu != null && i < data.vszTextoMenu.Length ? data.vszTextoMenu[i].szTextoMenu : "";
                string val = data.vszValorMenu != null && i < data.vszValorMenu.Length ? data.vszValorMenu[i].szValorMenu : "";
                sb.Append("{\"label\":\"").Append(Esc(text ?? "")).Append("\",\"value\":\"").Append(Esc(val ?? "")).Append("\"}");
            }
        }
        sb.Append("]");
        sb.Append("}");
        return sb.ToString();
    }

    private static void EmitRawCapture(string captureJson)
    {
        if (String.IsNullOrWhiteSpace(_eventId)) return;
        Console.Out.WriteLine("{\"id\":\"" + Esc(_eventId) + "\",\"event\":" + captureJson + "}");
        Console.Out.Flush();
    }

    // Bloqueia lendo stdin ate receber um capture_response do agente JS
    // ou um abort. Retorna null em cancelamento.
    private static string WaitForCaptureResponse(ushort identificador)
    {
        while (true)
        {
            string line;
            try { line = Console.In.ReadLine(); }
            catch (Exception ex) { EmitEvent("INFO", "stdin ReadLine falhou: " + ex.Message); return null; }
            if (line == null) return null; // EOF
            line = line.Trim();
            if (line.Length == 0) continue;

            // parse minimal: procura "action":"capture_response" e "value":"..." e opcionalmente "identificador":NNN
            string action = ExtractJsonString(line, "action");
            if (action == "abort_capture") return null;
            if (action != "capture_response")
            {
                // qualquer outra linha (ex.: novo comando) — ignora pra nao quebrar
                EmitEvent("INFO", "Linha stdin ignorada durante captura: " + line.Substring(0, Math.Min(160, line.Length)));
                continue;
            }
            // se trouxe identificador, valida — senao aceita.
            string identStr = ExtractJsonNumber(line, "identificador");
            if (!String.IsNullOrEmpty(identStr))
            {
                int ident;
                if (Int32.TryParse(identStr, out ident) && ident != (int)identificador)
                {
                    EmitEvent("INFO", "capture_response com identificador divergente (esperado=" + (int)identificador + " recebido=" + ident + ") — ignorando");
                    continue;
                }
            }
            string value = ExtractJsonString(line, "value");
            return value ?? "";
        }
    }

    private static string ExtractJsonString(string json, string key)
    {
        string pat = "\"" + key + "\":\"";
        int i = json.IndexOf(pat);
        if (i < 0) return null;
        int start = i + pat.Length;
        var sb = new StringBuilder();
        for (int j = start; j < json.Length; j++)
        {
            char c = json[j];
            if (c == '\\' && j + 1 < json.Length)
            {
                char n = json[j + 1];
                if (n == 'n') sb.Append('\n');
                else if (n == 'r') sb.Append('\r');
                else if (n == 't') sb.Append('\t');
                else sb.Append(n);
                j++;
                continue;
            }
            if (c == '"') return sb.ToString();
            sb.Append(c);
        }
        return sb.ToString();
    }

    private static string ExtractJsonNumber(string json, string key)
    {
        string pat = "\"" + key + "\":";
        int i = json.IndexOf(pat);
        if (i < 0) return null;
        int start = i + pat.Length;
        var sb = new StringBuilder();
        for (int j = start; j < json.Length; j++)
        {
            char c = json[j];
            if (Char.IsWhiteSpace(c)) { if (sb.Length == 0) continue; else break; }
            if (Char.IsDigit(c) || c == '-') { sb.Append(c); continue; }
            break;
        }
        return sb.Length == 0 ? null : sb.ToString();
    }

    private static string NormalizeInteractiveCaptureValue(ushort identificador, string value)
    {
        if (String.IsNullOrWhiteSpace(value)) return value ?? "";

        if (identificador == PWINFO_TOTAMNT || identificador == PWINFO_TRNORIGAMNT)
        {
            return NormalizeCurrencyToCents(value);
        }

        if (identificador == PWINFO_TRNDATE)
        {
            return NormalizeDateToPaygo(value);
        }

        if (identificador == PWINFO_TRNTIME)
        {
            return NormalizeTimeToPaygo(value);
        }

        return value.Trim();
    }

    private static string NormalizeCurrencyToCents(string value)
    {
        string text = (value ?? "").Trim();
        if (String.IsNullOrWhiteSpace(text)) return "";
        string compact = text.Replace(" ", "");
        // PayGo usa centavos inteiros (209 = R$ 2,09). Digitos sem separador = centavos.
        bool onlyDigits = true;
        foreach (char c in compact)
        {
            if (!Char.IsDigit(c)) { onlyDigits = false; break; }
        }
        if (onlyDigits && compact.Length > 0) return compact;

        string normalized = compact.Contains(",")
            ? compact.Replace(".", "").Replace(",", ".")
            : compact;
        decimal amount;
        if (Decimal.TryParse(normalized, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out amount))
        {
            return ((long)Decimal.Round(amount * 100m, 0)).ToString();
        }
        var digits = new StringBuilder();
        foreach (char c in text)
        {
            if (Char.IsDigit(c)) digits.Append(c);
        }
        return digits.ToString();
    }

    private static string NormalizeDateToPaygo(string value)
    {
        string text = (value ?? "").Trim();
        if (text.Length == 10 && text[4] == '-' && text[7] == '-')
        {
            return text.Substring(8, 2) + text.Substring(5, 2) + text.Substring(2, 2);
        }
        if (text.Length == 10 && text[2] == '/' && text[5] == '/')
        {
            string year = text.Substring(6);
            return text.Substring(0, 2) + text.Substring(3, 2) + year.Substring(year.Length - 2);
        }
        var digits = new StringBuilder();
        foreach (char c in text)
        {
            if (Char.IsDigit(c)) digits.Append(c);
        }
        string onlyDigits = digits.ToString();
        if (onlyDigits.Length == 8) return onlyDigits.Substring(0, 2) + onlyDigits.Substring(2, 2) + onlyDigits.Substring(6, 2);
        return onlyDigits;
    }

    private static string NormalizeTimeToPaygo(string value)
    {
        string text = (value ?? "").Trim();
        if (text.Length >= 5 && text[2] == ':')
        {
            string seconds = text.Length >= 8 && text[5] == ':' ? text.Substring(6, 2) : "00";
            return text.Substring(0, 2) + text.Substring(3, 2) + seconds;
        }
        var digits = new StringBuilder();
        foreach (char c in text)
        {
            if (Char.IsDigit(c)) digits.Append(c);
        }
        return digits.ToString();
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

    private static string QrDisplayPreference()
    {
        string value = String.IsNullOrWhiteSpace(_qrDisplayPreference)
            ? Environment.GetEnvironmentVariable("PAYGO_QR_DISPLAY_PREF")
            : _qrDisplayPreference;
        value = (value ?? "").Trim();
        return value == "1" ? "1" : "2";
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
        Field(sb, "cnfReq", Result(PWINFO_CNFREQ), true);
        sb.Append("}");
        return sb.ToString();
    }

    private static string PendingResultsJson()
    {
        bool usePending = !String.IsNullOrWhiteSpace(Result(PWINFO_PNDREQNUM));
        var sb = new StringBuilder();
        sb.Append("{");
        Field(sb, "authCode", Result(PWINFO_AUTHCODE), false);
        Field(sb, "brand", Result(PWINFO_CARDNAME), true);
        Field(sb, "acquirer", usePending ? Result(PWINFO_PNDAUTHSYST) : Result(PWINFO_AUTHSYST), true);
        Field(sb, "customerReceipt", First(Result(PWINFO_RCPTCHOLDER), Result(PWINFO_RCPTFULL)), true);
        Field(sb, "merchantReceipt", First(Result(PWINFO_RCPTMERCH), Result(PWINFO_RCPTFULL)), true);
        Field(sb, "reqNum", usePending ? Result(PWINFO_PNDREQNUM) : Result(PWINFO_REQNUM), true);
        Field(sb, "locRef", usePending ? Result(PWINFO_PNDAUTLOCREF) : Result(PWINFO_AUTLOCREF), true);
        Field(sb, "extRef", usePending ? Result(PWINFO_PNDAUTEXTREF) : Result(PWINFO_AUTEXTREF), true);
        Field(sb, "virtMerch", usePending ? Result(PWINFO_PNDVIRTMERCH) : Result(PWINFO_VIRTMERCH), true);
        Field(sb, "authSyst", usePending ? Result(PWINFO_PNDAUTHSYST) : Result(PWINFO_AUTHSYST), true);
        Field(sb, "cnfReq", Result(PWINFO_CNFREQ), true);
        Field(sb, "amountInCents", First(Result(PWINFO_TOTAMNT), Result(PWINFO_TRNORIGAMNT)), true);
        sb.Append("}");
        return sb.ToString();
    }

    private static bool HasPendingTransaction()
    {
        return !String.IsNullOrWhiteSpace(Result(PWINFO_PNDREQNUM));
    }

    private static bool HasConfirmationTuple()
    {
        return !String.IsNullOrWhiteSpace(First(Result(PWINFO_PNDREQNUM), Result(PWINFO_REQNUM)));
    }

    private static bool IsHostCommunicationError(short ret)
    {
        return ret == -2582 || ret == -2583 || ret == -2584 || ret == -2585 || ret == -2586 || ret == -2587;
    }

    private static bool ShouldReturnPending(short ret, string resultMessage)
    {
        if (ret == PWRET_FROMHOSTPENDTRN) return true;
        if (HasPendingTransaction()) return true;
        if (IsHostCommunicationError(ret) && HasConfirmationTuple() && (IsAuthorizedMessage(resultMessage) || RequiresConfirmation()))
            return true;
        return false;
    }

    private static bool RequiresConfirmation()
    {
        return Result(PWINFO_CNFREQ) == "1";
    }

    private static bool IsUndoConfirmation(uint confirmation)
    {
        return confirmation == PWCNF_REV_MANU_AUT || confirmation == PWCNF_REV_DISP_AUT;
    }

    private static short ConfirmCurrent(uint confirmation)
    {
        return Fn<PW_iConfirmation_>("PW_iConfirmation")(
            confirmation,
            Result(PWINFO_REQNUM),
            Result(PWINFO_AUTLOCREF),
            Result(PWINFO_AUTEXTREF),
            Result(PWINFO_VIRTMERCH),
            Result(PWINFO_AUTHSYST)
        );
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
        string resultMessage = Result(PWINFO_RESULTMSG);
        if (ShouldReturnPending(ret, resultMessage))
            return Json("pendingConfirmation", false, First(resultMessage, "Existe transacao pendente de confirmacao no PayGo"), ret, PendingResultsJson());
        return "{\"ok\":false,\"status\":\"error\",\"function\":\"" + Esc(fn) + "\",\"ret\":" + ret + ",\"message\":\"" + Esc(resultMessage) + "\"}";
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
      return [PayGoBridge]::Sale($DllPath, $WorkingDir, [string]$Command.saleId, [int]$Command.amountInCents, [string]$Command.method, [int]$Command.installments, [string]$Command.paygoMenuChoice, [string]$Command.captureValuesBase64, [string]$Command.qrDisplayPreference)
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
        [string]$Command.pinpadPort,
        [string]$Command.paygoMenuChoice,
        $false
      )
    }

    if ($cmdAction -eq "admin") {
      return [PayGoBridge]::Operation(
        $DllPath,
        $WorkingDir,
        0x20,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        $true
      )
    }


    if ($cmdAction -eq "cleanup") {
      return [PayGoBridge]::Cleanup($DllPath, $WorkingDir)
    }

    if ($cmdAction -eq "pending") {
      return [PayGoBridge]::ProbePending($DllPath, $WorkingDir)
    }

    if ($cmdAction -eq "confirm" -or $cmdAction -eq "undo") {
      if ([string]::IsNullOrWhiteSpace([string]$Command.confirmationJsonBase64)) {
        throw "confirmationJsonBase64 e obrigatorio para $cmdAction"
      }

      $confirmation = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$Command.confirmationJsonBase64)) | ConvertFrom-Json
      if ($cmdAction -eq "confirm") {
        return [PayGoBridge]::Confirm($DllPath, $WorkingDir, $confirmation.reqNum, $confirmation.locRef, $confirmation.extRef, $confirmation.virtMerch, $confirmation.authSyst)
      }

      return [PayGoBridge]::Undo($DllPath, $WorkingDir, $confirmation.reqNum, $confirmation.locRef, $confirmation.extRef, $confirmation.virtMerch, $confirmation.authSyst, [string]$Command.undoReason)
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
  [PayGoBridge]::Sale($DllPath, $WorkingDir, $SaleId, $AmountInCents, $Method, $Installments, $PaygoMenuChoice, $CaptureValuesBase64, $QrDisplayPreference)
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
  [PayGoBridge]::Operation($DllPath, $WorkingDir, 0x01, $CpfCnpj, $PontoDeCaptura, $Ambiente, $SenhaTecnica, $UsePinpad, $PinpadPort, "", $false)
  exit
}

if ($Action -eq "admin") {
  [PayGoBridge]::Operation($DllPath, $WorkingDir, 0x20, "", "", "", "", "", "", "", $true)
  exit
}


if ($Action -eq "cleanup") {
  [PayGoBridge]::Cleanup($DllPath, $WorkingDir)
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
  [PayGoBridge]::Undo($DllPath, $WorkingDir, $json.reqNum, $json.locRef, $json.extRef, $json.virtMerch, $json.authSyst, $UndoReason)
  exit
}
