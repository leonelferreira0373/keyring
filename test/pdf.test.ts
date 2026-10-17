import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfDeTexto } from "../src/pdf.ts";

test("é um PDF bem formado: cabeçalho, %%EOF e a tabela xref aponta para os objectos", () => {
  const pdf = pdfDeTexto("linha 1\nlinha 2");
  const s = pdf.toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  const inicio = Number(/startxref\n(\d+)\n%%EOF/.exec(s)?.[1]);
  assert.equal(s.slice(inicio, inicio + 4), "xref");
  const tamanho = Number(/\/Size (\d+)/.exec(s)?.[1]);
  const entradas = s.slice(inicio).split("\n").slice(3, 3 + tamanho - 1);
  assert.equal(entradas.length, tamanho - 1);
  entradas.forEach((e, k) => {
    assert.equal(e.length, 19, "cada entrada tem 20 bytes com o fim de linha");
    const offset = Number(e.slice(0, 10));
    assert.ok(s.slice(offset).startsWith(`${k + 1} 0 obj`), `objecto ${k + 1} em ${offset}`);
  });
});

test("muitas linhas dão várias páginas", () => {
  const texto = Array.from({ length: 150 }, (_, i) => `linha ${i}`).join("\n");
  const s = pdfDeTexto(texto).toString("latin1");
  assert.match(s, /\/Count 3/);
});

test("um texto vazio dá uma página", () => {
  assert.match(pdfDeTexto("").toString("latin1"), /\/Count 1/);
});

test("acentos do português em WinAnsi, parênteses e barras escapados, o resto vira ?", () => {
  const s = pdfDeTexto("ção (x) \\ — 😀").toString("latin1");
  assert.ok(s.includes("\\347"), "ç");
  assert.ok(s.includes("\\343"), "ã");
  assert.ok(s.includes("\\(x\\)"), "parênteses escapados");
  assert.ok(s.includes("\\\\"), "barra escapada");
  assert.ok(s.includes("\\227"), "travessão em WinAnsi");
  assert.ok(s.includes("?"), "o emoji vira ?");
});

test("linhas mais largas do que a página são quebradas", () => {
  const s = pdfDeTexto("x".repeat(300)).toString("latin1");
  assert.ok((s.match(/\) Tj/g) ?? []).length >= 4);
});
