import { test } from "node:test";
import assert from "node:assert/strict";
import { Redator } from "../src/redator.ts";

const SEGREDO = "SEGREDO-ABCDEF-123";

test("troca o segredo inteiro por ***", () => {
  const r = new Redator([SEGREDO]);
  assert.equal(r.empurrar(`antes ${SEGREDO} depois`) + r.fim(), "antes *** depois");
});

test("troca-o mesmo partido em dois pedaços, em TODAS as posições de corte", () => {
  const texto = `antes ${SEGREDO} depois`;
  for (let corte = 1; corte < texto.length; corte++) {
    const r = new Redator([SEGREDO]);
    const saida = r.empurrar(texto.slice(0, corte)) + r.empurrar(texto.slice(corte)) + r.fim();
    assert.equal(saida, "antes *** depois", `corte em ${corte}`);
  }
});

test("troca-o mesmo chegando um carácter de cada vez", () => {
  const texto = `x${SEGREDO}y${SEGREDO}z`;
  const r = new Redator([SEGREDO]);
  let saida = "";
  for (const c of texto) saida += r.empurrar(c);
  assert.equal(saida + r.fim(), "x***y***z");
});

test("o mais comprido primeiro: 'abcdef' e 'abcdefgh' não deixam o resto à vista", () => {
  const r = new Redator(["abcdef", "abcdefgh"]);
  assert.equal(r.empurrar("x abcdefgh y") + r.fim(), "x *** y");
});

test("valores com menos de 6 caracteres não se censuram (estragariam a saída)", () => {
  const r = new Redator(["admin", "1234", SEGREDO]);
  assert.equal(r.empurrar("admin 1234 " + SEGREDO) + r.fim(), "admin 1234 ***");
});

test("sem segredos, passa tudo igual e logo", () => {
  const r = new Redator([]);
  assert.equal(r.empurrar("olá"), "olá");
  assert.equal(r.fim(), "");
});

test("o texto longe de um segredo sai logo (só se retém o que pode ser o início de um)", () => {
  const r = new Redator([SEGREDO]);
  const saida = r.empurrar("x".repeat(100));
  assert.ok(saida.length >= 100 - SEGREDO.length, `saiu ${saida.length}`);
  assert.equal(saida + r.fim(), "x".repeat(100));
});

test("o texto retido sai no fim()", () => {
  const r = new Redator([SEGREDO]);
  assert.equal(r.empurrar("abc"), "");
  assert.equal(r.fim(), "abc");
});
