import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;

function novo(): { raiz: string; tranca: TrancaDeTeste; gs: Gavetas } {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-gavetas-"));
  const tranca = new TrancaDeTeste(novaChave());
  return { raiz, tranca, gs: Gavetas.abrir(raiz, tranca) };
}
function todosOsFicheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((f) => {
    const c = join(pasta, f);
    return statSync(c).isDirectory() ? todosOsFicheiros(c) : [c];
  });
}

test("os números são de 1 em diante, em sequência, e nunca se reutilizam", () => {
  const { raiz, gs } = novo();
  assert.equal(gs.criar("acme", "Acme Corp").numero, 1);
  assert.equal(gs.criar("globex", "Globex").numero, 2);
  assert.equal(gs.criar("sete", "x", "", 7).numero, 7);
  assert.equal(gs.criar("oito", "x").numero, 8, "depois de um número explícito segue-se o seguinte");
  assert.deepEqual(gs.numeros(), [1, 2, 7, 8]);
  assert.throws(() => gs.criar("outra", "x", "", 7), codigo("numero"));
  rmSync(raiz, { recursive: true, force: true });
});

test("resolver por número, por nome, sem maiúsculas nem acentos", () => {
  const { raiz, gs } = novo();
  gs.criar("Acme Corp", "AC");
  gs.criar("Ação", "x");
  assert.equal(gs.resolver("1").nome, "Acme Corp");
  assert.equal(gs.resolver("acme corp").numero, 1);
  assert.equal(gs.resolver("  ACME CORP ").numero, 1);
  assert.equal(gs.resolver("acao").numero, 2);
  assert.throws(() => gs.resolver("9"), codigo("gaveta"));
  assert.throws(() => gs.resolver("não existe"), codigo("gaveta"));
  rmSync(raiz, { recursive: true, force: true });
});

test("nomes de gaveta inválidos ou repetidos são recusados", () => {
  const { raiz, gs } = novo();
  gs.criar("acme", "x");
  for (const mau of ["ls", "12", "", "a/b", "ACME", "Acme "]) assert.throws(() => gs.criar(mau, "x"), (e) => ["nome", "duplicada"].includes((e as { codigo?: string }).codigo ?? ""), mau);
  rmSync(raiz, { recursive: true, force: true });
});

test("guardar e ler: valor, nota e ficheiro binário (vazio e 3 MB)", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x");
  g.guardarItem({ nome: "a.valor", tipo: "valor", conteudo: Buffer.from("segredo ç"), env: "A_VALOR" });
  g.guardarItem({ nome: "a.nota", tipo: "nota", conteudo: Buffer.from("# nota\ntexto") });
  const binario = randomBytes(3 * 1024 * 1024);
  g.guardarItem({ nome: "a.ficheiro", tipo: "ficheiro", conteudo: binario, nomeOriginal: "chave.pem" });
  g.guardarItem({ nome: "a.vazio", tipo: "ficheiro", conteudo: Buffer.alloc(0), nomeOriginal: "vazio.txt" });
  const outra = gs.resolver("acme");
  assert.equal(outra.lerItem("a.valor").toString("utf8"), "segredo ç");
  assert.equal(outra.lerItem("a.nota").toString("utf8"), "# nota\ntexto");
  assert.ok(outra.lerItem("a.ficheiro").equals(binario));
  assert.equal(outra.lerItem("a.vazio").length, 0);
  assert.deepEqual(outra.item("a.ficheiro")?.ficheiro, { nomeOriginal: "chave.pem", tamanho: binario.length });
  assert.equal(outra.item("a.valor")?.env, "A_VALOR");
  assert.equal(outra.item("a.valor")?.estado, "ok");
  rmSync(raiz, { recursive: true, force: true });
});

test("o histórico guarda a actual e as 5 anteriores, e apaga as mais velhas do disco", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x");
  for (let i = 1; i <= 8; i++) g.guardarItem({ nome: "x", tipo: "valor", conteudo: Buffer.from(`v${i}`) });
  assert.equal(g.item("x")?.versoes.length, 6);
  assert.equal(g.lerItem("x").toString(), "v8");
  assert.equal(g.lerItem("x", 1).toString(), "v7");
  assert.equal(g.lerItem("x", 5).toString(), "v3");
  assert.throws(() => g.lerItem("x", 6), codigo("versao"));
  assert.equal(readdirSync(join(raiz, "1", "itens")).length, 6);
  rmSync(raiz, { recursive: true, force: true });
});

test("o tipo de um item não muda; nomes de item e de variável inválidos são recusados", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x");
  g.guardarItem({ nome: "x", tipo: "valor", conteudo: Buffer.from("1") });
  assert.throws(() => g.guardarItem({ nome: "x", tipo: "nota", conteudo: Buffer.from("2") }), codigo("tipo"));
  assert.throws(() => g.guardarItem({ nome: "../x", tipo: "valor", conteudo: Buffer.from("2") }), codigo("nome"));
  assert.throws(() => g.guardarItem({ nome: "y", tipo: "valor", conteudo: Buffer.from("2"), env: "minusculas" }), codigo("nome"));
  assert.equal(g.item("y"), undefined, "um item recusado não deixa rasto");
  assert.equal(readdirSync(join(raiz, "1", "itens")).length, 1, "nem blobs esquecidos");
  rmSync(raiz, { recursive: true, force: true });
});

test("estado: 'ok' marca a data de hoje; 'rodar' e 'revogado' não mexem na data", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x");
  g.guardarItem({ nome: "x", tipo: "valor", conteudo: Buffer.from("1") });
  g.definirEstado("x", "rodar");
  assert.equal(g.item("x")?.estado, "rodar");
  assert.equal(g.item("x")?.verificadoEm, undefined);
  g.definirEstado("x", "ok", "2026-10-16");
  assert.equal(g.item("x")?.verificadoEm, "2026-10-16");
  assert.throws(() => g.definirEstado("x", "estragado" as never), codigo("estado"));
  assert.throws(() => g.definirEstado("nao-existe", "ok"), codigo("item"));
  rmSync(raiz, { recursive: true, force: true });
});

test("remover apaga o item e todos os seus ficheiros", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x");
  g.guardarItem({ nome: "x", tipo: "valor", conteudo: Buffer.from("1") });
  g.guardarItem({ nome: "x", tipo: "valor", conteudo: Buffer.from("2") });
  g.removerItem("x");
  assert.equal(g.item("x"), undefined);
  assert.equal(readdirSync(join(raiz, "1", "itens")).length, 0);
  rmSync(raiz, { recursive: true, force: true });
});

test("nada fica em claro no disco (nem o segredo, nem o nome, nem a ficha)", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("gaveta-secreta", "Entidade Secreta", "Ficha secreta do projecto");
  g.guardarItem({ nome: "item.muito.visivel", tipo: "valor", conteudo: Buffer.from("SENTINELA-valor-9981"), nota: "nota-sentinela" });
  const proibidos = ["SENTINELA-valor-9981", "item.muito.visivel", "gaveta-secreta", "Entidade Secreta", "Ficha secreta", "nota-sentinela"];
  for (const f of todosOsFicheiros(raiz)) {
    const dados = readFileSync(f);
    for (const p of proibidos) {
      assert.ok(!dados.includes(Buffer.from(p)), `${f} contém «${p}»`);
      assert.ok(!dados.includes(Buffer.from(p, "utf16le")), `${f} contém «${p}» (utf16)`);
    }
  }
  rmSync(raiz, { recursive: true, force: true });
});

test("dois processos a escrever a mesma gaveta não perdem dados (leitura dentro do lock)", () => {
  const { raiz, gs } = novo();
  gs.criar("acme", "x");
  const a = gs.abrirGaveta(1);
  const b = gs.abrirGaveta(1);
  a.guardarItem({ nome: "do.a", tipo: "valor", conteudo: Buffer.from("A") });
  b.guardarItem({ nome: "do.b", tipo: "valor", conteudo: Buffer.from("B") });
  a.guardarItem({ nome: "do.a2", tipo: "valor", conteudo: Buffer.from("A2") });
  const final = gs.abrirGaveta(1);
  assert.deepEqual(final.dados.itens.map((i) => i.nome).sort(), ["do.a", "do.a2", "do.b"]);
  rmSync(raiz, { recursive: true, force: true });
});

test("outra tranca (outro utilizador do Windows) não abre: erro claro, nada se altera", () => {
  const { raiz } = novo();
  assert.throws(() => Gavetas.abrir(raiz, new TrancaDeTeste(novaChave())), codigo("adulterado"));
  assert.ok(existsSync(join(raiz, "_raiz", "chave.dpapi")));
  rmSync(raiz, { recursive: true, force: true });
});

test("a ficha pode mudar e fica guardada", () => {
  const { raiz, gs } = novo();
  const g = gs.criar("acme", "x", "primeira");
  g.definirFicha("segunda");
  assert.equal(gs.resolver("acme").dados.ficha, "segunda");
  rmSync(raiz, { recursive: true, force: true });
});
