import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comBloqueio, escreverAtomico, hoje } from "../src/util.ts";

function pastaTemp(): string {
  return mkdtempSync(join(tmpdir(), "keyring-teste-"));
}

test("escreverAtomico cria e substitui sem deixar temporários", () => {
  const dir = pastaTemp();
  const f = join(dir, "a.bin");
  escreverAtomico(f, Buffer.from("um"));
  escreverAtomico(f, Buffer.from("dois"));
  assert.equal(readFileSync(f, "utf8"), "dois");
  assert.deepEqual(readdirSync(dir), ["a.bin"]);
  rmSync(dir, { recursive: true, force: true });
});

test("escreverAtomico cria as pastas que faltam", () => {
  const dir = pastaTemp();
  escreverAtomico(join(dir, "x", "y", "z.txt"), "olá");
  assert.equal(readFileSync(join(dir, "x", "y", "z.txt"), "utf8"), "olá");
  rmSync(dir, { recursive: true, force: true });
});

test("comBloqueio: um segundo bloqueio dentro do primeiro desiste com 'ocupada'", () => {
  const dir = pastaTemp();
  assert.throws(
    () => comBloqueio(dir, () => comBloqueio(dir, () => 1, 200)),
    (e: unknown) => (e as { codigo?: string }).codigo === "ocupada",
  );
  // e o bloqueio fica livre depois
  assert.equal(comBloqueio(dir, () => 7), 7);
  rmSync(dir, { recursive: true, force: true });
});

test("comBloqueio: um bloqueio velho (processo morto) é removido", () => {
  const dir = pastaTemp();
  const lock = join(dir, "keyring.lock");
  writeFileSync(lock, "");
  const antigo = new Date(Date.now() - 60_000);
  utimesSync(lock, antigo, antigo);
  assert.equal(comBloqueio(dir, () => "ok"), "ok");
  rmSync(dir, { recursive: true, force: true });
});

test("comBloqueio liberta o bloqueio mesmo quando a função falha", () => {
  const dir = pastaTemp();
  assert.throws(() => comBloqueio(dir, () => { throw new Error("boom"); }), /boom/);
  assert.equal(comBloqueio(dir, () => 1), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("hoje() devolve AAAA-MM-DD", () => {
  assert.match(hoje(), /^\d{4}-\d{2}-\d{2}$/);
});
