import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;
function novo() {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-proj-"));
  const gs = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave()));
  const acme = gs.criar("acme", "Acme Corp");
  const outra = gs.criar("globex", "Globex");
  acme.guardarItem({ nome: "github.token", tipo: "valor", conteudo: Buffer.from("tok-123456"), env: "GH_TOKEN" });
  outra.guardarItem({ nome: "db.senha", tipo: "valor", conteudo: Buffer.from("db-123456"), env: "DB_SENHA" });
  return { raiz, gs };
}

test("um projecto junta itens de gavetas diferentes e resolve-os", () => {
  const { raiz, gs } = novo();
  gs.criarProjecto("bc", "Acme Website");
  gs.adicionarAoProjecto("bc", 1, "github.token");
  gs.adicionarAoProjecto("bc", 2, "db.senha");
  const itens = gs.resolverProjecto("bc");
  assert.deepEqual(itens.map((r) => `${r.gaveta.numero}/${r.item.nome}`), ["1/github.token", "2/db.senha"]);
  assert.equal(itens[1].gaveta.lerItem("db.senha").toString(), "db-123456");
  rmSync(raiz, { recursive: true, force: true });
});

test("adicionar um item que não existe, repetir, ou usar um projecto desconhecido dá erro claro", () => {
  const { raiz, gs } = novo();
  gs.criarProjecto("bc", "x");
  assert.throws(() => gs.adicionarAoProjecto("bc", 1, "nao.existe"), codigo("item"));
  assert.throws(() => gs.adicionarAoProjecto("bc", 9, "x"), codigo("gaveta"));
  assert.throws(() => gs.adicionarAoProjecto("fantasma", 1, "github.token"), codigo("projecto"));
  assert.throws(() => gs.criarProjecto("BC", "x"), codigo("duplicada"));
  assert.throws(() => gs.criarProjecto("ls", "x"), codigo("nome"));
  gs.adicionarAoProjecto("bc", 1, "github.token");
  gs.adicionarAoProjecto("bc", 1, "github.token");
  assert.equal(gs.projecto("bc").itens.length, 1, "repetir não duplica");
  rmSync(raiz, { recursive: true, force: true });
});

test("um item apagado depois fica no projecto mas resolverProjecto avisa com erro claro", () => {
  const { raiz, gs } = novo();
  gs.criarProjecto("bc", "x");
  gs.adicionarAoProjecto("bc", 1, "github.token");
  gs.resolver("1").removerItem("github.token");
  assert.throws(() => gs.resolverProjecto("bc"), codigo("item"));
  rmSync(raiz, { recursive: true, force: true });
});

test("os projectos sobrevivem a reabrir a pasta", () => {
  const { raiz, gs } = novo();
  gs.criarProjecto("bc", "descrição");
  const outra = Gavetas.abrir(raiz, gs.tranca);
  assert.deepEqual(outra.projectos().map((p) => p.nome), ["bc"]);
  rmSync(raiz, { recursive: true, force: true });
});
