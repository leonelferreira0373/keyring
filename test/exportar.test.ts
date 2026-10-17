import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { exportarGaveta, importarGaveta } from "../src/exportar.ts";
import { Gavetas } from "../src/gavetas.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;
const FRASE = "frase-passe de teste";

function origem() {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-exp-"));
  const gs = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave()));
  gs.criar("outra", "x");
  const g = gs.criar("Acme Corp", "AC", "Ficha da AC", 5);
  const binario = randomBytes(200_000);
  g.guardarItem({ nome: "seg", tipo: "valor", conteudo: Buffer.from("SEGREDO-ABC-123456"), env: "SEG", nota: "n", estado: "rodar", verificadoEm: "2026-10-16" });
  g.guardarItem({ nome: "seg", tipo: "valor", conteudo: Buffer.from("SEGREDO-NOVO-654321") });
  g.guardarItem({ nome: "nota", tipo: "nota", conteudo: Buffer.from("# texto\nç ã") });
  g.guardarItem({ nome: "chave", tipo: "ficheiro", conteudo: binario, nomeOriginal: "chave.pem" });
  return { raiz, gs, g, binario };
}

test("exportar e importar noutro PC (outra tranca): tudo igual, com o número, o histórico e os estados", () => {
  const { raiz, g, binario } = origem();
  const ficheiro = exportarGaveta(g, FRASE);
  const raiz2 = mkdtempSync(join(tmpdir(), "keyring-exp2-"));
  const gs2 = Gavetas.abrir(raiz2, new TrancaDeTeste(novaChave()));
  const nova = importarGaveta(gs2, ficheiro, FRASE);
  assert.equal(nova.numero, 5);
  assert.equal(nova.nome, "Acme Corp");
  assert.equal(nova.dados.entidade, "AC");
  assert.equal(nova.dados.ficha, "Ficha da AC");
  assert.equal(nova.lerItem("seg").toString(), "SEGREDO-NOVO-654321");
  assert.equal(nova.lerItem("seg", 1).toString(), "SEGREDO-ABC-123456", "o histórico vem junto");
  assert.equal(nova.item("seg")?.env, "SEG");
  assert.equal(nova.item("seg")?.estado, "rodar");
  assert.equal(nova.item("seg")?.verificadoEm, "2026-10-16");
  assert.equal(nova.lerItem("nota").toString(), "# texto\nç ã");
  assert.ok(nova.lerItem("chave").equals(binario));
  assert.deepEqual(nova.item("chave")?.ficheiro, { nomeOriginal: "chave.pem", tamanho: binario.length });
  assert.equal(gs2.criar("seguinte", "x").numero, 6, "o contador de números segue depois do importado");
  rmSync(raiz, { recursive: true, force: true });
  rmSync(raiz2, { recursive: true, force: true });
});

test("o ficheiro exportado não tem nada em claro", () => {
  const { raiz, g } = origem();
  const f = exportarGaveta(g, FRASE);
  for (const p of ["SEGREDO-ABC-123456", "SEGREDO-NOVO", "Ficha da AC", "Acme Corp", "chave.pem", "cloudflare"]) {
    assert.ok(!f.includes(Buffer.from(p)), p);
  }
  rmSync(raiz, { recursive: true, force: true });
});

test("frase errada, ficheiro alterado, ficheiro que não é nosso e frase curta dão erros claros", () => {
  const { raiz, g } = origem();
  const f = exportarGaveta(g, FRASE);
  const gs2 = Gavetas.abrir(mkdtempSync(join(tmpdir(), "keyring-exp3-")), new TrancaDeTeste(novaChave()));
  assert.throws(() => importarGaveta(gs2, f, "outra frase qualquer"), codigo("frase"));
  const adulterado = Buffer.from(f);
  adulterado[adulterado.length - 20] ^= 1;
  assert.throws(() => importarGaveta(gs2, adulterado, FRASE), codigo("frase"));
  assert.throws(() => importarGaveta(gs2, Buffer.from("isto não é uma cópia"), FRASE), codigo("formato"));
  assert.throws(() => exportarGaveta(g, "curta"), codigo("frase"));
  assert.equal(gs2.numeros().length, 0, "uma importação falhada não deixa gavetas a meio");
  rmSync(raiz, { recursive: true, force: true });
});

test("importar para um número ocupado ou nome repetido recusa; com outro número funciona", () => {
  const { raiz, gs, g } = origem();
  const f = exportarGaveta(g, FRASE);
  assert.throws(() => importarGaveta(gs, f, FRASE), codigo("duplicada"), "já existe uma gaveta com este nome");
  gs.criar("noutro-nome", "x", "", 9);
  const gs2 = Gavetas.abrir(mkdtempSync(join(tmpdir(), "keyring-exp4-")), new TrancaDeTeste(novaChave()));
  gs2.criar("ocupa5", "x", "", 5);
  assert.throws(() => importarGaveta(gs2, f, FRASE), codigo("numero"));
  assert.equal(importarGaveta(gs2, f, FRASE, 12).numero, 12);
  rmSync(raiz, { recursive: true, force: true });
});
