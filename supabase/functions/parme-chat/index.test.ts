// Testes unitários dos helpers do parme-chat.
// Executar via supabase--test_edge_functions (functions: ["parme-chat"]).

import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  clientMessageCount,
  inferClientName,
  mergeClientMeta,
} from "./index.ts";

import {
  detectComplaint,
  extractOrderNumber,
  extractPhone,
  isValidReservation,
} from "./extractors.ts";

type Msg = { id: string; role: string; content: string; ts: number };

const conv = (...pairs: Array<[string, string]>): Msg[] =>
  pairs.map(([role, content], i) => ({ id: String(i), role, content, ts: i }));

// deno-lint-ignore no-explicit-any
const f = (m: Msg[]) => m as any;

const name = (m: Msg[]) => inferClientName(f(m));

// ---------------- inferClientName ----------------

Deno.test("inferClientName: 'meu nome é Mauro'", () => {
  assertEquals(name(conv(["user", "oi, meu nome é Mauro"])), "Mauro");
});

Deno.test("inferClientName: 'me chamo Carlos Silva'", () => {
  assertEquals(name(conv(["user", "me chamo Carlos Silva"])), "Carlos Silva");
});

Deno.test("inferClientName: 'aqui é o Pedro'", () => {
  assertEquals(name(conv(["user", "aqui é o Pedro"])), "Pedro");
});

Deno.test("inferClientName: 'sou a Ana'", () => {
  assertEquals(name(conv(["user", "sou a Ana"])), "Ana");
});

Deno.test("inferClientName: nome com dígitos (teste1)", () => {
  assertEquals(name(conv(["user", "meu nome é teste1"])), "Teste1");
});

Deno.test("inferClientName: pergunta+resposta curta 'Mauro'", () => {
  assertEquals(
    name(conv(["assistant", "Qual é seu nome?"], ["user", "Mauro"])),
    "Mauro",
  );
});

Deno.test("inferClientName: pergunta+resposta 'teste1'", () => {
  assertEquals(
    name(conv(["assistant", "Olá! Qual é o seu nome?"], ["user", "teste1"])),
    "Teste1",
  );
});

Deno.test("inferClientName: ignora stopwords (ok/obrigado)", () => {
  assertStrictEquals(name(conv(["user", "ok"])), null);
  assertStrictEquals(name(conv(["user", "obrigado"])), null);
});

Deno.test("inferClientName: ignora puramente numérico", () => {
  assertStrictEquals(
    name(conv(["assistant", "qual seu nome?"], ["user", "12345"])),
    null,
  );
});

Deno.test("inferClientName: sem pista retorna null", () => {
  assertStrictEquals(name(conv(["user", "quero pedir uma pizza"])), null);
});

// ---------------- mergeClientMeta ----------------

Deno.test("mergeClientMeta: preenche name a partir das mensagens", () => {
  const merged = mergeClientMeta(null, null, f(conv(["user", "meu nome é Mauro"]))) as Record<string, unknown>;
  assertEquals(merged.name, "Mauro");
});

Deno.test("mergeClientMeta: NÃO sobrescreve name existente", () => {
  const merged = mergeClientMeta({ name: "Mauro" }, null, f(conv(["user", "meu nome é Outro"]))) as Record<string, unknown>;
  assertEquals(merged.name, "Mauro");
});

Deno.test("mergeClientMeta: respeita 'nome' (PT) já existente", () => {
  const merged = mergeClientMeta({ nome: "Mauro" }, null, f(conv(["user", "meu nome é Outro"]))) as Record<string, unknown>;
  assertEquals(merged.nome, "Mauro");
  assertEquals(merged.name, undefined);
});

Deno.test("mergeClientMeta: usa fallback quando current vazio", () => {
  const merged = mergeClientMeta(null, { telefone: "61999999999" }, f([])) as Record<string, unknown>;
  assertEquals(merged.telefone, "61999999999");
});

// ---------------- clientMessageCount ----------------

Deno.test("clientMessageCount: conta só mensagens de cliente não vazias", () => {
  const flat = conv(
    ["assistant", "oi"],
    ["user", "olá"],
    ["system", "ctx"],
    ["user", "   "],
    ["model", "x"],
    ["user", "quero pedir"],
    ["tool", "{}"],
  );
  assertEquals(clientMessageCount(f(flat)), 2);
});

// ---------------- detectComplaint ----------------

Deno.test("detectComplaint: reconhece variações comuns", () => {
  const cases = [
    "meu pedido veio errado",
    "a comida chegou fria",
    "demorou muito",
    "atrasou demais",
    "faltou batata",
    "péssimo atendimento",
    "não chegou nada",
    "queria fazer uma reclamação",
    "veio errado o sabor",
  ];
  for (const c of cases) assert(detectComplaint(c), `deveria detectar: ${c}`);
});

Deno.test("detectComplaint: não dispara em frases neutras", () => {
  const cases = [
    "quero fazer um pedido",
    "qual o cardápio?",
    "boa noite, gostaria de reservar mesa",
  ];
  for (const c of cases) assert(!detectComplaint(c), `não deveria detectar: ${c}`);
});

// ---------------- extractOrderNumber ----------------

Deno.test("extractOrderNumber: pedido #12345", () => {
  assertEquals(extractOrderNumber("meu pedido #12345 não veio"), "12345");
});

Deno.test("extractOrderNumber: 'número do pedido: 4321'", () => {
  assertEquals(extractOrderNumber("número do pedido: 4321 está errado"), "4321");
});

Deno.test("extractOrderNumber: fallback loose (3-6 dígitos)", () => {
  assertEquals(extractOrderNumber("o 9876 chegou frio"), "9876");
});

Deno.test("extractOrderNumber: sem dígitos retorna null", () => {
  assertStrictEquals(extractOrderNumber("a comida está fria"), null);
});

// ---------------- extractPhone ----------------

Deno.test("extractPhone: celular com DDD e máscara", () => {
  assertEquals(extractPhone("contato (61) 99999-1234"), "61999991234");
});

Deno.test("extractPhone: fixo sem máscara", () => {
  assertEquals(extractPhone("ligue 3333-4444"), "33334444");
});

Deno.test("extractPhone: ausente", () => {
  assertStrictEquals(extractPhone("sem telefone aqui"), null);
});

// ---------------- isValidReservation ----------------

Deno.test("isValidReservation: válido", () => {
  assert(isValidReservation({
    nome: "Mauro",
    telefone: "61999991234",
    data: "2026-06-22",
    horario: "20:00",
    pessoas: 4,
  }));
});

Deno.test("isValidReservation: rejeita data inválida", () => {
  assert(!isValidReservation({
    nome: "Mauro", telefone: "61999991234",
    data: "22/06/2026", horario: "20:00", pessoas: 4,
  }));
});

Deno.test("isValidReservation: rejeita horário sem minutos", () => {
  assert(!isValidReservation({
    nome: "Mauro", telefone: "61999991234",
    data: "2026-06-22", horario: "20", pessoas: 4,
  }));
});

Deno.test("isValidReservation: rejeita telefone curto", () => {
  assert(!isValidReservation({
    nome: "Mauro", telefone: "1234",
    data: "2026-06-22", horario: "20:00", pessoas: 4,
  }));
});

Deno.test("isValidReservation: rejeita pessoas fora da faixa", () => {
  assert(!isValidReservation({
    nome: "Mauro", telefone: "61999991234",
    data: "2026-06-22", horario: "20:00", pessoas: 0,
  }));
  assert(!isValidReservation({
    nome: "Mauro", telefone: "61999991234",
    data: "2026-06-22", horario: "20:00", pessoas: 999,
  }));
});

Deno.test("isValidReservation: rejeita campos faltando", () => {
  assert(!isValidReservation({ nome: "Mauro" }));
});
