import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cifrar, decifrar, derivarChave, novaChave } from "../src/cripto.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;

test("ida e volta com 0, 1, 1000 bytes e 5 MB", () => {
  const chave = novaChave();
  for (const n of [0, 1, 1000, 5 * 1024 * 1024]) {
    const claro = randomBytes(n);
    assert.ok(decifrar(chave, cifrar(chave, claro, "a"), "a").equals(claro), `${n} bytes`);
  }
});

test("cada cifra usa um nonce novo: o mesmo texto dá selados diferentes", () => {
  const chave = novaChave();
  const a = cifrar(chave, Buffer.from("igual"), "x");
  const b = cifrar(chave, Buffer.from("igual"), "x");
  assert.notDeepEqual(a, b);
});

test("um byte mudado em qualquer posição é recusado", () => {
  const chave = novaChave();
  const selado = cifrar(chave, Buffer.from("segredo importante"), "x");
  for (const i of [0, 1, 12, 13, selado.length - 17, selado.length - 1]) {
    const mau = Buffer.from(selado);
    mau[i] ^= 0x01;
    assert.throws(() => decifrar(chave, mau, "x"), (e: unknown) => ["adulterado", "formato"].includes((e as { codigo?: string }).codigo ?? ""), `posição ${i}`);
  }
});

test("dados autenticados diferentes (outro ficheiro) são recusados", () => {
  const chave = novaChave();
  const selado = cifrar(chave, Buffer.from("x"), "json:a");
  assert.throws(() => decifrar(chave, selado, "json:b"), codigo("adulterado"));
});

test("chave errada é recusada", () => {
  const selado = cifrar(novaChave(), Buffer.from("x"), "a");
  assert.throws(() => decifrar(novaChave(), selado, "a"), codigo("adulterado"));
});

test("formato truncado ou desconhecido é recusado com 'formato'", () => {
  const chave = novaChave();
  assert.throws(() => decifrar(chave, Buffer.alloc(5), "a"), codigo("formato"));
  const selado = cifrar(chave, Buffer.from("x"), "a");
  selado[0] = 9;
  assert.throws(() => decifrar(chave, selado, "a"), codigo("formato"));
});

test("uma chave que não tem 32 bytes é recusada", () => {
  assert.throws(() => cifrar(Buffer.alloc(16), Buffer.from("x"), "a"), codigo("chave"));
});

test("derivarChave é determinística e depende da frase e do sal", () => {
  const sal = randomBytes(16);
  const a = derivarChave("frase um", sal);
  assert.ok(a.equals(derivarChave("frase um", sal)));
  assert.ok(!a.equals(derivarChave("frase dois", sal)));
  assert.ok(!a.equals(derivarChave("frase um", randomBytes(16))));
  assert.equal(a.length, 32);
});
