import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { construirIndice, indiceTexto } from "../src/indice.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

function novo() {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-indice-"));
  const gs = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave()));
  const acme = gs.criar("acme", "Acme Corp", "Empresa. Servidor 203.0.113.10.");
  acme.guardarItem({ nome: "cloudflare.token", tipo: "valor", conteudo: Buffer.from("VALOR-SECRETO-AAA111"), env: "CF_TOKEN", nota: "conta dev", estado: "ok", verificadoEm: "2026-10-16" });
  acme.guardarItem({ nome: "servidor.segredo", tipo: "valor", conteudo: Buffer.from("VALOR-SECRETO-BBB222"), env: "SERVIDOR", estado: "rodar" });
  acme.guardarItem({ nome: "pat.antigo", tipo: "valor", conteudo: Buffer.from("VALOR-SECRETO-CCC333"), estado: "revogado" });
  acme.guardarItem({ nome: "chave.pem", tipo: "ficheiro", conteudo: Buffer.from("-----BEGIN FAKE-----"), nomeOriginal: "chave.pem" });
  gs.criar("globex", "Globex");
  gs.criarProjecto("bc", "Acme Website");
  gs.adicionarAoProjecto("bc", 1, "cloudflare.token");
  return { raiz, gs };
}

test("o índice nunca contém um valor secreto, nem em texto nem em JSON", () => {
  const { raiz, gs } = novo();
  const ind = construirIndice(gs, "2026-10-16");
  const texto = indiceTexto(ind);
  const json = JSON.stringify(ind);
  for (const v of ["VALOR-SECRETO-AAA111", "VALOR-SECRETO-BBB222", "VALOR-SECRETO-CCC333", "BEGIN FAKE"]) {
    assert.ok(!texto.includes(v), `texto contém ${v}`);
    assert.ok(!json.includes(v), `json contém ${v}`);
  }
  rmSync(raiz, { recursive: true, force: true });
});

test("o índice enumera gavetas numeradas, itens, estados, variáveis e contagens", () => {
  const { raiz, gs } = novo();
  const ind = construirIndice(gs, "2026-10-16");
  assert.deepEqual(ind.gavetas.map((g) => [g.numero, g.nome]), [[1, "acme"], [2, "globex"]]);
  const acme = ind.gavetas[0];
  assert.equal(acme.total, 4);
  assert.equal(acme.rodar, 1);
  assert.equal(acme.revogados, 1);
  const cf = acme.itens.find((i) => i.nome === "cloudflare.token");
  assert.deepEqual([cf?.tipo, cf?.estado, cf?.env, cf?.verificadoEm], ["valor", "ok", "CF_TOKEN", "2026-10-16"]);
  const t = indiceTexto(ind);
  assert.match(t, /GAVETA 1 — acme \(Acme Corp\)/);
  assert.match(t, /GAVETA 2 — globex/);
  assert.match(t, /cloudflare\.token\s+valor\s+ok\s+env=CF_TOKEN/);
  assert.match(t, /servidor\.segredo\s+valor\s+rodar/);
  assert.match(t, /Servidor 203.0.113.10/, "a ficha aparece");
  assert.match(t, /keyring sudo <gaveta> correr/, "explica como usar sem mostrar");
  rmSync(raiz, { recursive: true, force: true });
});

test("os projectos aparecem com o estado de cada item, e 'em-falta' se o item desapareceu", () => {
  const { raiz, gs } = novo();
  gs.adicionarAoProjecto("bc", 1, "servidor.segredo");
  gs.resolver("1").removerItem("servidor.segredo");
  const ind = construirIndice(gs, "2026-10-16");
  const bc = ind.projectos[0];
  assert.equal(bc.nome, "bc");
  assert.deepEqual(bc.itens.map((i) => `${i.gaveta}/${i.item}:${i.estado}`), ["1/cloudflare.token:ok", "1/servidor.segredo:em-falta"]);
  assert.match(indiceTexto(ind), /PROJECTOS/);
  rmSync(raiz, { recursive: true, force: true });
});

test("sem gavetas, o índice diz como começar", () => {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-indice-"));
  const gs = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave()));
  assert.match(indiceTexto(construirIndice(gs, "2026-10-16")), /Ainda não há gavetas.*keyring sudo criar/s);
  rmSync(raiz, { recursive: true, force: true });
});
