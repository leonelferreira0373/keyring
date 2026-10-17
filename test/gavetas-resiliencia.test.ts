import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;

function novo(): { raiz: string; tranca: TrancaDeTeste; gs: Gavetas } {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-resiliencia-"));
  const tranca = new TrancaDeTeste(novaChave());
  return { raiz, tranca, gs: Gavetas.abrir(raiz, tranca) };
}

test("se o ficheiro de raiz se perder, uma gaveta nova não toma o número de uma que existe (nem lhe estraga a chave)", () => {
  const { raiz, tranca, gs } = novo();
  const g1 = gs.criar("acme", "x");
  g1.guardarItem({ nome: "seg", tipo: "valor", conteudo: Buffer.from("valor-da-gaveta-1") });
  gs.criar("outra", "x");
  rmSync(join(raiz, "_raiz", "raiz.json.enc"));
  const gs2 = Gavetas.abrir(raiz, tranca);
  const nova = gs2.criar("terceira", "x");
  assert.equal(nova.numero, 3);
  assert.equal(gs2.abrirGaveta(1).lerItem("seg").toString(), "valor-da-gaveta-1");
  rmSync(raiz, { recursive: true, force: true });
});

test("uma gaveta que não abre não impede as outras: fica registada em avarias", () => {
  const { raiz, gs } = novo();
  gs.criar("acme", "x");
  gs.criar("estragada", "x");
  gs.criar("terceira", "x");
  rmSync(join(raiz, "2", "gaveta.json.enc"));
  assert.deepEqual(gs.todas().map((g) => g.numero), [1, 3]);
  assert.deepEqual(gs.avarias.map((a) => a.numero), [2]);
  assert.equal(gs.resolver("terceira").numero, 3);
  assert.throws(() => gs.resolver("2"), codigo("falta"));
  rmSync(raiz, { recursive: true, force: true });
});
