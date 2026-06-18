/**
 * PayGoWeb flow portado do ACBr Delphi para TypeScript.
 *
 * Fontes usadas como referencia:
 * - ACBrTEFAPIPayGoWeb.pas
 * - ACBrTEFDPayGoWeb.pas
 * - Demo ACBrTEFD/TEFAPI/Delphi/frPrincipal.pas
 *
 * Este arquivo copia a estrutura do ACBr: montar PWINFO_*, iniciar PWOPER_*,
 * executar o loop de captura, expor callbacks e finalizar com PW_iConfirmation.
 * A parte nativa fica atras da interface PayGoNativePort para permitir usar
 * C#/PowerShell, koffi, edge-js ou qualquer outro binding.
 */

export const PWRET = {
  OK: 0,
  FROM_HOST_PENDING_TRANSACTION: -2599,
  FROM_HOST: -2596,
  HOST_TIMEOUT: -2585,
  HOST_CONNECTION_ERROR: -2583,
  HOST_CONNECTION_LOST: -2582,
  INVALID_PARAM: -2499,
  NOT_INSTALLED: -2498,
  MORE_DATA: -2497,
  NO_DATA: -2496,
  DISPLAY: -2495,
  INVALID_CALL: -2494,
  NOTHING: -2493,
  CANCEL: -2491,
  TIMEOUT: -2490,
  PINPAD_NOT_FOUND: -2489,
  FALLBACK: -2486,
} as const;

export const PWOPER = {
  INSTALL: 0x01,
  ADMIN: 0x20,
  SALE: 0x21,
  SALE_VOID: 0x22,
} as const;

export const PWINFO = {
  AUT_IP: 0x05,
  AUT_PORT: 0x07,
  POS_ID: 0x11,
  AUT_NAME: 0x15,
  AUT_VER: 0x16,
  AUT_DEV: 0x17,
  DEST_TCPIP: 0x1b,
  MERCH_CNPJ_CPF: 0x1c,
  AUT_CAP: 0x24,
  TOT_AMNT: 0x25,
  CURRENCY: 0x26,
  CURR_EXP: 0x27,
  FISCAL_REF: 0x28,
  CARD_TYPE: 0x29,
  AUTH_SYST: 0x35,
  VIRT_MERCH: 0x36,
  REQ_NUM: 0x32,
  FIN_TYPE: 0x3b,
  INSTALLMENTS: 0x3c,
  RESULT_MSG: 0x42,
  CNF_REQ: 0x43,
  AUT_LOC_REF: 0x44,
  AUT_EXT_REF: 0x45,
  AUTH_CODE: 0x46,
  CARD_NAME: 0x4b,
  RCPT_FULL: 0x52,
  RCPT_MERCH: 0x53,
  RCPT_CHOLDER: 0x54,
 AUTH_MNGT_USER: 0xf5,
 AUTH_TECH_USER: 0xf6,
  TRN_ORIG_DATE: 0x57,
  TRN_ORIG_NSU: 0x58,
  TRN_ORIG_AMNT: 0x60,
  TRN_ORIG_AUTH: 0x62,
  TRN_ORIG_REQ_NUM: 0x72,
  TRN_ORIG_TIME: 0x73,
  TRN_ORIG_LOC_REF: 0x78,
  PAYMNT_TYPE: 0x1f21,
  AUTHPOS_QR_CODE: 0x1f77,
  USING_PINPAD: 0x7f01,
  PP_COMM_PORT: 0x7f02,
  PND_AUTH_SYST: 0x7f05,
  PND_VIRT_MERCH: 0x7f06,
  PND_REQ_NUM: 0x7f07,
  PND_AUT_LOC_REF: 0x7f08,
  PND_AUT_EXT_REF: 0x7f09,
  DSP_QR_PREF: 0x7f50,
} as const;

export const PWDAT = {
  MENU: 1,
  TYPED: 2,
  CARD_INFO: 3,
  PP_ENTRY: 5,
  PP_ENC_PIN: 6,
  CARD_OFFLINE: 9,
  CARD_ONLINE: 10,
  PP_CONFIRM: 11,
  BARCODE: 12,
  PP_REMOVE_CARD: 13,
  PP_GENERIC_CMD: 14,
  PP_DATA_POS_CONFIRM: 16,
  USER_AUTH: 17,
  DISPLAY_CHECKOUT: 18,
  TEST_KEY: 19,
  DISPLAY_QR_CODE: 20,
} as const;

export const PWCNF = {
  CONFIRM_AUTO: 0x00000121,
  UNDO_MANUAL_AUTH: 0x00003231,
} as const;

export type PayGoPaymentMethod = "credit" | "debit" | "pix" | "voucher";
export type PayGoQrPreference = "pinpad" | "checkout";

export interface PayGoSaleRequest {
  saleId: string;
  amount: number;
  method: PayGoPaymentMethod;
  installments?: number;
  acquirer?: string;
  qrPreference?: PayGoQrPreference;
  additionalParams?: PayGoParams;
}

export interface PayGoCancelRequest {
  nsu: string;
  authCode: string;
  amount: number;
  date: Date;
  acquirer?: string;
  locRef?: string;
  reqNum?: string;
  additionalParams?: PayGoParams;
}

export type PayGoParams = Record<number, string>;

export interface PayGoGetData {
  identifier: number;
  dataType: number;
  prompt?: string;
  initialValue?: string;
  minLength?: number;
  maxLength?: number;
  acceptsNull?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface PayGoExecResult {
  ret: number;
  data?: PayGoGetData[];
}

export interface PayGoNativePort {
  init(workingDir: string): Promise<number> | number;
  newTransaction(operation: number): Promise<number> | number;
  addParam(info: number, value: string): Promise<number> | number;
  execTransaction(): Promise<PayGoExecResult> | PayGoExecResult;
  getResult(info: number): Promise<string> | string;
  confirm(
    status: number,
    reqNum: string,
    locRef: string,
    extRef: string,
    virtMerch: string,
    authSyst: string,
  ): Promise<number> | number;
  abort?(): Promise<number> | number;
  continueWithData?(identifier: number, value: string): Promise<number> | number;
}

export interface PayGoCallbacks {
  log?(message: string): void;
  displayMessage?(message: string, target: "operator" | "customer" | "pinpad"): void;
  displayQrCode?(qrCode: string): void;
  waitPinpad?(message: string): void;
  askMenu?(title: string, options: Array<{ label: string; value: string }>): Promise<string> | string;
  askField?(field: PayGoGetData): Promise<string> | string;
  pendingTransaction?(pending: PayGoPendingTransaction): Promise<"confirm" | "undo"> | "confirm" | "undo";
}

export interface PayGoPendingTransaction {
  reqNum: string;
  locRef: string;
  extRef: string;
  virtMerch: string;
  authSyst: string;
}

export interface PayGoTransactionResponse extends PayGoPendingTransaction {
  status: "approved" | "denied" | "pendingConfirmation" | "error";
  ret: number;
  message: string;
  authCode: string;
  cardName: string;
  merchantReceipt: string;
  customerReceipt: string;
  fullReceipt: string;
}

export function amountToPayGoCents(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor de pagamento invalido");
  }
  return String(Math.round(amount * 100));
}

export function buildSaleParams(request: PayGoSaleRequest): PayGoParams {
  const installments = request.installments && request.installments > 0 ? request.installments : 1;
  const params: PayGoParams = {
    [PWINFO.AUT_NAME]: "PDV",
    [PWINFO.AUT_VER]: "1.0.0",
    [PWINFO.AUT_DEV]: "PayGo",
    [PWINFO.AUT_CAP]: "384",
    [PWINFO.DSP_QR_PREF]: request.qrPreference === "pinpad" ? "1" : "2",
    [PWINFO.FISCAL_REF]: request.saleId,
    [PWINFO.CURR_EXP]: "2",
    [PWINFO.TOT_AMNT]: amountToPayGoCents(request.amount),
    [PWINFO.CURRENCY]: "986",
  };

  if (request.method === "pix") {
    params[PWINFO.PAYMNT_TYPE] = "8";
  } else {
    params[PWINFO.PAYMNT_TYPE] = "1";
    params[PWINFO.CARD_TYPE] = request.method === "credit" ? "1" : request.method === "debit" ? "2" : "4";
  }

  if (request.method === "credit") {
    params[PWINFO.FIN_TYPE] = installments > 1 ? "4" : "1";
    params[PWINFO.INSTALLMENTS] = String(installments);
  }

  if (request.acquirer) {
    params[PWINFO.AUTH_SYST] = request.acquirer;
  }

  return { ...params, ...(request.additionalParams ?? {}) };
}

export function buildCancelParams(request: PayGoCancelRequest): PayGoParams {
  const dd = String(request.date.getDate()).padStart(2, "0");
  const mm = String(request.date.getMonth() + 1).padStart(2, "0");
  const yy = String(request.date.getFullYear()).slice(-2);
  const hh = String(request.date.getHours()).padStart(2, "0");
  const nn = String(request.date.getMinutes()).padStart(2, "0");
  const ss = String(request.date.getSeconds()).padStart(2, "0");

  const params: PayGoParams = {
    [PWINFO.TRN_ORIG_NSU]: request.nsu,
    [PWINFO.TRN_ORIG_DATE]: `${dd}${mm}${yy}`,
    [PWINFO.TRN_ORIG_TIME]: `${hh}${nn}${ss}`,
    [PWINFO.TRN_ORIG_AMNT]: amountToPayGoCents(request.amount),
    [PWINFO.TRN_ORIG_AUTH]: request.authCode,
  };

  if (request.acquirer) params[PWINFO.AUTH_SYST] = request.acquirer;
  if (request.locRef) params[PWINFO.TRN_ORIG_LOC_REF] = request.locRef;
  if (request.reqNum) params[PWINFO.TRN_ORIG_REQ_NUM] = request.reqNum;

  return { ...params, ...(request.additionalParams ?? {}) };
}

export class PayGoAcbrFlow {
  constructor(
    private readonly native: PayGoNativePort,
    private readonly workingDir: string,
    private readonly callbacks: PayGoCallbacks = {},
  ) {}

  async sale(request: PayGoSaleRequest): Promise<PayGoTransactionResponse> {
    const params = buildSaleParams(request);
    return this.execute(PWOPER.SALE, params);
  }

  async cancel(request: PayGoCancelRequest): Promise<PayGoTransactionResponse> {
    const params = buildCancelParams(request);
    return this.execute(PWOPER.SALE_VOID, params);
  }

  async admin(params: PayGoParams = {}): Promise<PayGoTransactionResponse> {
    return this.execute(PWOPER.ADMIN, params);
  }

  async confirmApproved(response: PayGoPendingTransaction): Promise<void> {
    const ret = await this.native.confirm(
      PWCNF.CONFIRM_AUTO,
      response.reqNum,
      response.locRef,
      response.extRef,
      response.virtMerch,
      response.authSyst,
    );
    this.assertOk("PW_iConfirmation", ret);
  }

  async undo(response: PayGoPendingTransaction): Promise<void> {
    const ret = await this.native.confirm(
      PWCNF.UNDO_MANUAL_AUTH,
      response.reqNum,
      response.locRef,
      response.extRef,
      response.virtMerch,
      response.authSyst,
    );
    this.assertOk("PW_iConfirmation", ret);
  }

  private async execute(operation: number, params: PayGoParams): Promise<PayGoTransactionResponse> {
    this.assertOk("PW_iInit", await this.native.init(this.workingDir));
    this.assertOk("PW_iNewTransac", await this.native.newTransaction(operation));

    for (const [info, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        this.assertOk(`PW_iAddParam(${info})`, await this.native.addParam(Number(info), String(value)));
      }
    }

    while (true) {
      const step = await this.native.execTransaction();

      if (step.ret === PWRET.OK) {
        return this.collectResponse(PWRET.OK);
      }

      if (step.ret === PWRET.FROM_HOST_PENDING_TRANSACTION) {
        const pending = await this.collectPending();
        const decision = await this.callbacks.pendingTransaction?.(pending);
        if (decision === "confirm") await this.confirmApproved(pending);
        if (decision === "undo") await this.undo(pending);
        return { ...this.emptyResponse(), ...pending, ret: step.ret, status: "pendingConfirmation" };
      }

      if (step.ret === PWRET.MORE_DATA || step.ret === PWRET.DISPLAY || step.ret === PWRET.NOTHING) {
        await this.handleDataRequests(step.data ?? []);
        continue;
      }

      return this.collectResponse(step.ret);
    }
  }

  private async handleDataRequests(requests: PayGoGetData[]): Promise<void> {
    for (const request of requests) {
      if (request.dataType === PWDAT.DISPLAY_QR_CODE) {
        const qrCode = request.initialValue || request.prompt || "";
        this.callbacks.displayQrCode?.(qrCode);
        continue;
      }

      if (request.dataType === PWDAT.DISPLAY_CHECKOUT) {
        this.callbacks.displayMessage?.(request.initialValue || request.prompt || "", "operator");
        continue;
      }

      if (request.dataType === PWDAT.PP_REMOVE_CARD || request.dataType === PWDAT.PP_ENTRY) {
        this.callbacks.waitPinpad?.(request.prompt || "Aguardando pinpad");
        continue;
      }

      if (request.dataType === PWDAT.MENU) {
        const value = await this.callbacks.askMenu?.(request.prompt || "Selecione", request.options ?? []);
        await this.answer(request.identifier, value ?? request.initialValue ?? "");
        continue;
      }

      if (
        request.dataType === PWDAT.TYPED ||
        request.dataType === PWDAT.BARCODE ||
        request.dataType === PWDAT.USER_AUTH ||
        request.dataType === PWDAT.CARD_INFO
      ) {
        const value = await this.callbacks.askField?.(request);
        await this.answer(request.identifier, value ?? request.initialValue ?? "");
        continue;
      }

      this.callbacks.log?.(`Tipo de captura PayGo nao tratado: ${request.dataType}`);
    }
  }

  private async answer(identifier: number, value: string): Promise<void> {
    if (!this.native.continueWithData) {
      throw new Error("Binding nativo nao implementa continueWithData para responder captura PayGo");
    }
    this.assertOk(`continueWithData(${identifier})`, await this.native.continueWithData(identifier, value));
  }

  private async collectPending(): Promise<PayGoPendingTransaction> {
    return {
      reqNum: await this.native.getResult(PWINFO.PND_REQ_NUM),
      locRef: await this.native.getResult(PWINFO.PND_AUT_LOC_REF),
      extRef: await this.native.getResult(PWINFO.PND_AUT_EXT_REF),
      virtMerch: await this.native.getResult(PWINFO.PND_VIRT_MERCH),
      authSyst: await this.native.getResult(PWINFO.PND_AUTH_SYST),
    };
  }

  private async collectResponse(ret: number): Promise<PayGoTransactionResponse> {
    const response: PayGoTransactionResponse = {
      ret,
      status: ret === PWRET.OK ? "approved" : "error",
      message: await this.native.getResult(PWINFO.RESULT_MSG),
      reqNum: await this.native.getResult(PWINFO.REQ_NUM),
      locRef: await this.native.getResult(PWINFO.AUT_LOC_REF),
      extRef: await this.native.getResult(PWINFO.AUT_EXT_REF),
      virtMerch: await this.native.getResult(PWINFO.VIRT_MERCH),
      authSyst: await this.native.getResult(PWINFO.AUTH_SYST),
      authCode: await this.native.getResult(PWINFO.AUTH_CODE),
      cardName: await this.native.getResult(PWINFO.CARD_NAME),
      merchantReceipt: await this.native.getResult(PWINFO.RCPT_MERCH),
      customerReceipt: await this.native.getResult(PWINFO.RCPT_CHOLDER),
      fullReceipt: await this.native.getResult(PWINFO.RCPT_FULL),
    };

    if (ret !== PWRET.OK) response.status = "error";
    if (ret === PWRET.OK && !response.authCode && !response.reqNum) response.status = "denied";
    return response;
  }

  private emptyResponse(): PayGoTransactionResponse {
    return {
      status: "error",
      ret: 0,
      message: "",
      reqNum: "",
      locRef: "",
      extRef: "",
      virtMerch: "",
      authSyst: "",
      authCode: "",
      cardName: "",
      merchantReceipt: "",
      customerReceipt: "",
      fullReceipt: "",
    };
  }

  private assertOk(functionName: string, ret: number): void {
    if (ret !== PWRET.OK) {
      throw new Error(`${functionName} falhou ret=${ret}`);
    }
  }
}
