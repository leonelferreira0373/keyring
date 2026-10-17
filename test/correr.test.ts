import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { correr } from "../src/correr.ts";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const SEGREDO = "SEGREDO-ABCDEFGH-1";
const NODE = process.execPath;

function preparar() {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-correr-"));
  const g = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave())).criar("acme", "x");
  g.guardarItem({ nome: "seg", tipo: "valor", conteudo: Buffer.from(SEGREDO), env: "MEU_SEGREDO" });
  g.guardarItem({ nome: "revogado.x", tipo: "valor", conteudo: Buffer.from("REVOGADO-ZZZZZZZZ"), env: "REVOGADO_X", estado: "revogado" });
  g.guardarItem({ nome: "sem.env", tipo: "valor", conteudo: Buffer.from("SEMENV-123456") });
  g.guardarItem({ nome: "chave", tipo: "ficheiro", conteudo: Buffer.from("conteudo da chave"), env: "CHAVE_FICHEIRO", nomeOriginal: "../../chave.pem" });
  g.guardarItem({ nome: "nota", tipo: "nota", conteudo: Buffer.from("texto") });
  const itens = g.dados.itens.map((item) => ({ gaveta: g, item }));
  const out: string[] = [];
  const err: string[] = [];
  const saidas = { out: { write: (t: string | Buffer) => out.push(String(t)) }, err: { write: (t: string | Buffer) => err.push(String(t)) } };
  return { raiz, itens, out, err, saidas };
}

test("o segredo injectado nunca aparece na saída: vem como ***", async () => {
  const { raiz, itens, out, saidas } = preparar();
  const codigo = await correr(itens, [NODE, "-e", "process.stdout.write('v=' + process.env.MEU_SEGREDO)"], saidas);
  assert.equal(codigo, 0);
  assert.equal(out.join(""), "v=***");
  rmSync(raiz, { recursive: true, force: true });
});

test("também no stderr, e o código de saída do comando passa tal como é", async () => {
  const { raiz, itens, out, err, saidas } = preparar();
  const codigo = await correr(itens, [NODE, "-e", "console.error('erro ' + process.env.MEU_SEGREDO); process.exit(3)"], saidas);
  assert.equal(codigo, 3);
  assert.ok(!err.join("").includes(SEGREDO));
  assert.match(err.join(""), /erro \*\*\*/);
  assert.equal(out.join(""), "");
  rmSync(raiz, { recursive: true, force: true });
});

test("um segredo partido por uma pausa entre duas escritas do comando continua censurado", async () => {
  const { raiz, itens, out, saidas } = preparar();
  const script = "const v = process.env.MEU_SEGREDO; process.stdout.write('[' + v.slice(0, 7)); setTimeout(() => process.stdout.write(v.slice(7) + ']'), 150);";
  await correr(itens, [NODE, "-e", script], saidas);
  assert.equal(out.join(""), "[***]");
  rmSync(raiz, { recursive: true, force: true });
});

test("revogados, sem variável e notas não se injectam; avisa-se", async () => {
  const { raiz, itens, out, err, saidas } = preparar();
  const script = "process.stdout.write([process.env.REVOGADO_X ?? 'ausente', process.env.SEM_ENV ?? 'ausente'].join(','))";
  await correr(itens, [NODE, "-e", script], saidas);
  assert.equal(out.join(""), "ausente,ausente");
  assert.match(err.join(""), /revogado/);
  assert.match(err.join(""), /sem\.env/);
  rmSync(raiz, { recursive: true, force: true });
});

test("um ficheiro vai para uma pasta temporária privada, com nome seguro, e apaga-se no fim", async () => {
  const { raiz, itens, out, saidas } = preparar();
  const script = "const f = process.env.CHAVE_FICHEIRO; process.stdout.write(f + '|' + require('node:fs').readFileSync(f, 'utf8'))";
  const codigo = await correr(itens, [NODE, "-e", script], saidas);
  assert.equal(codigo, 0);
  const [caminho, conteudo] = out.join("").split("|");
  assert.equal(conteudo, "conteudo da chave");
  assert.ok(caminho.endsWith("chave.pem"), caminho);
  assert.ok(!caminho.includes(".."), "o nome não pode fugir da pasta");
  assert.ok(!existsSync(caminho), "o ficheiro temporário tem de ter sido apagado");
  rmSync(raiz, { recursive: true, force: true });
});

test("um comando que não existe dá um código diferente de zero e não deixa lixo", async () => {
  const { raiz, itens, err, saidas } = preparar();
  const codigo = await correr(itens, ["comando-que-nao-existe-xyz"], saidas);
  assert.notEqual(codigo, 0);
  assert.ok(err.join("").length > 0);
  rmSync(raiz, { recursive: true, force: true });
});

test("sem comando dá erro claro", async () => {
  const { raiz, itens, saidas } = preparar();
  await assert.rejects(() => correr(itens, [], saidas), (e: unknown) => (e as { codigo?: string }).codigo === "comando");
  rmSync(raiz, { recursive: true, force: true });
});
