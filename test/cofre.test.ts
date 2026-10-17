import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { Cofre } from "../src/cofre.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;
function novo(): { dir: string; cofre: Cofre } {
  const dir = mkdtempSync(join(tmpdir(), "keyring-cofre-"));
  return { dir, cofre: new Cofre(dir, novaChave()) };
}

test("JSON: ida e volta; um nome que não existe dá undefined", () => {
  const { dir, cofre } = novo();
  assert.equal(cofre.lerJson("x.json.enc"), undefined);
  cofre.escreverJson("x.json.enc", { a: 1, texto: "olá ç ã" });
  assert.deepEqual(cofre.lerJson("x.json.enc"), { a: 1, texto: "olá ç ã" });
  rmSync(dir, { recursive: true, force: true });
});

test("blobs: ida e volta com vazio, binário e 3 MB", () => {
  const { dir, cofre } = novo();
  for (const n of [0, 7, 3 * 1024 * 1024]) {
    const id = randomUUID();
    const dados = randomBytes(n);
    cofre.escreverBlob(id, dados);
    assert.ok(cofre.lerBlob(id).equals(dados), `${n} bytes`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("chave errada não abre o JSON nem o blob", () => {
  const { dir, cofre } = novo();
  const id = randomUUID();
  cofre.escreverJson("x.json.enc", { a: 1 });
  cofre.escreverBlob(id, Buffer.from("segredo"));
  const outro = new Cofre(dir, novaChave());
  assert.throws(() => outro.lerJson("x.json.enc"), codigo("adulterado"));
  assert.throws(() => outro.lerBlob(id), codigo("adulterado"));
  rmSync(dir, { recursive: true, force: true });
});

test("trocar um blob pelo nome de outro é detectado (o nome está autenticado)", () => {
  const { dir, cofre } = novo();
  const a = randomUUID();
  const b = randomUUID();
  cofre.escreverBlob(a, Buffer.from("A"));
  cofre.escreverBlob(b, Buffer.from("B"));
  renameSync(join(dir, "itens", `${a}.enc`), join(dir, "itens", "tmp.enc"));
  renameSync(join(dir, "itens", `${b}.enc`), join(dir, "itens", `${a}.enc`));
  assert.throws(() => cofre.lerBlob(a), codigo("adulterado"));
  rmSync(dir, { recursive: true, force: true });
});

test("ids de blob fora do formato (fuga de pasta) são recusados", () => {
  const { dir, cofre } = novo();
  for (const mau of ["..\\..\\x", "../x", "a/b", "", "x".repeat(40)]) {
    assert.throws(() => cofre.lerBlob(mau), codigo("id"), JSON.stringify(mau));
    assert.throws(() => cofre.escreverBlob(mau, Buffer.from("x")), codigo("id"));
  }
  rmSync(dir, { recursive: true, force: true });
});

test("temporários esquecidos por um processo morto não estragam nada e limpam-se", () => {
  const { dir, cofre } = novo();
  cofre.escreverJson("x.json.enc", { ok: true });
  writeFileSync(join(dir, "x.json.enc.tmp-deadbeef"), "meio escrito");
  const haUmaHora = new Date(Date.now() - 3_600_000);
  utimesSync(join(dir, "x.json.enc.tmp-deadbeef"), haUmaHora, haUmaHora);
  assert.deepEqual(cofre.lerJson("x.json.enc"), { ok: true });
  assert.equal(cofre.limparTemporarios(), 1);
  assert.ok(!existsSync(join(dir, "x.json.enc.tmp-deadbeef")));
  assert.ok(readdirSync(dir).includes("x.json.enc"));
  rmSync(dir, { recursive: true, force: true });
});

test("apagarBlob apaga e não falha se já não existe", () => {
  const { dir, cofre } = novo();
  const id = randomUUID();
  cofre.escreverBlob(id, Buffer.from("x"));
  cofre.apagarBlob(id);
  cofre.apagarBlob(id);
  assert.ok(!existsSync(join(dir, "itens", `${id}.enc`)));
  rmSync(dir, { recursive: true, force: true });
});

test("um temporário recente é de uma escrita a decorrer noutro processo: não se apaga", () => {
  const { dir, cofre } = novo();
  writeFileSync(join(dir, "x.json.enc.tmp-cafe0001"), "a escrever agora");
  assert.equal(cofre.limparTemporarios(), 0);
  assert.ok(existsSync(join(dir, "x.json.enc.tmp-cafe0001")));
  rmSync(dir, { recursive: true, force: true });
});
