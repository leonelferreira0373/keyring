import { test } from "node:test";
import assert from "node:assert/strict";
import { limparPlicas, nomeSeguro, normalizar, validarNomeEnv, validarNomeGaveta, validarNomeItem } from "../src/modelo.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;

test("nomes de gaveta válidos: letras com acentos, espaços e hífen", () => {
  for (const ok of ["acme", "Acme Corp", "Globex", "Initech-Labs", "ação 2"]) validarNomeGaveta(ok);
});

test("nomes de gaveta inválidos: vazio, só números, comando, barras, longos", () => {
  for (const mau of ["", "  ", "12", "ls", "REC", "sudo", "Pôr", "a/b", "..\\x", "x".repeat(41), "-acme"]) {
    assert.throws(() => validarNomeGaveta(mau), codigo("nome"), JSON.stringify(mau));
  }
});

test("nomes de item: minúsculas, pontos e sublinhados; o resto é recusado", () => {
  validarNomeItem("cloudflare.api_token");
  for (const mau of ["", "A", "a b", "../x", "x".repeat(65), ".x", "é"]) {
    assert.throws(() => validarNomeItem(mau), codigo("nome"), JSON.stringify(mau));
  }
});

test("nomes de variável de ambiente: MAIÚSCULAS e sublinhados", () => {
  validarNomeEnv("CLOUDFLARE_API_TOKEN");
  for (const mau of ["", "a", "1A", "A-B", "A B"]) assert.throws(() => validarNomeEnv(mau), codigo("nome"), mau);
});

test("normalizar tira acentos e maiúsculas; limparPlicas tira plicas e aspas tipográficas", () => {
  assert.equal(normalizar("  Ação Silva "), "acao silva");
  assert.equal(limparPlicas("'Acme Corp'"), "Acme Corp");
  assert.equal(limparPlicas("´gaveta1´"), "gaveta1");
  assert.equal(limparPlicas("“acme”"), "acme");
});

test("nomeSeguro: nunca sai da pasta nem usa nomes reservados do Windows", () => {
  assert.equal(nomeSeguro("../../x.pem"), "x.pem");
  assert.equal(nomeSeguro("..\\..\\y.env"), "y.env");
  assert.equal(nomeSeguro("con.txt"), "_con.txt");
  assert.equal(nomeSeguro("a:b?.pdf"), "a_b_.pdf");
  assert.equal(nomeSeguro(""), "ficheiro");
  assert.equal(nomeSeguro(".."), "ficheiro");
  assert.equal(nomeSeguro("relatório final. "), "relatório final");
});
