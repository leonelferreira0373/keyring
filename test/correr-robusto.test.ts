import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { correr, prepararAmbiente } from "../src/correr.ts";
import { novaChave } from "../src/cripto.ts";
import { Gavetas } from "../src/gavetas.ts";
import { limparResiduos } from "../src/residuos.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const NODE = process.execPath;

function gavetaCom(itens: { nome: string; tipo: "valor" | "ficheiro"; conteudo: string; env: string; nomeOriginal?: string }[]) {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-robusto-"));
  const g = Gavetas.abrir(raiz, new TrancaDeTeste(novaChave())).criar("acme", "x");
  for (const i of itens) g.guardarItem({ nome: i.nome, tipo: i.tipo, conteudo: Buffer.from(i.conteudo), env: i.env, nomeOriginal: i.nomeOriginal });
  return { raiz, itens: g.dados.itens.map((item) => ({ gaveta: g, item })) };
}

test("a saída binária do comando passa byte a byte (nada de UTF-8 forçado)", async () => {
  const { raiz, itens } = gavetaCom([{ nome: "seg", tipo: "valor", conteudo: "SEGREDO-ABCDEFGH-1", env: "MEU_SEGREDO" }]);
  const pedacos: Buffer[] = [];
  const bytes = [0xff, 0x00, 0xfe, 0x80, 0xc3, 0x28, 0x41];
  const codigo = await correr(itens, [NODE, "-e", `process.stdout.write(Buffer.from(${JSON.stringify(bytes)}))`], {
    out: { write: (t: string | Buffer) => pedacos.push(Buffer.from(t as Buffer)) },
    err: { write: () => {} },
  });
  assert.equal(codigo, 0);
  assert.deepEqual([...Buffer.concat(pedacos)], bytes);
  rmSync(raiz, { recursive: true, force: true });
});

test("um segredo com acentos continua censurado quando a saída é tratada como bytes", async () => {
  const { raiz, itens } = gavetaCom([{ nome: "seg", tipo: "valor", conteudo: "açúcar-ção-ÑÑ", env: "SEG_ACENTOS" }]);
  const pedacos: Buffer[] = [];
  await correr(itens, [NODE, "-e", "process.stdout.write('[' + process.env.SEG_ACENTOS + ']')"], {
    out: { write: (t: string | Buffer) => pedacos.push(Buffer.from(t as Buffer)) },
    err: { write: () => {} },
  });
  assert.equal(Buffer.concat(pedacos).toString("utf8"), "[***]");
  rmSync(raiz, { recursive: true, force: true });
});

test("a pasta temporária dos ficheiros leva a marca do processo dono", () => {
  const { raiz, itens } = gavetaCom([{ nome: "chave", tipo: "ficheiro", conteudo: "conteudo", env: "CHAVE_FICHEIRO", nomeOriginal: "chave.pem" }]);
  const preparo = prepararAmbiente(itens);
  const pasta = dirname(preparo.env.CHAVE_FICHEIRO);
  assert.equal(readFileSync(join(pasta, ".dono"), "utf8").trim(), String(process.pid));
  preparo.limpar();
  rmSync(raiz, { recursive: true, force: true });
});

test("limparResiduos apaga as pastas de processos mortos e as de abrir esquecidas, e só essas", () => {
  const base = mkdtempSync(join(tmpdir(), "keyring-residuos-"));
  const mk = (nome: string, dono?: string, idadeMs = 0) => {
    const d = join(base, nome);
    mkdirSync(d);
    writeFileSync(join(d, "chave.pem"), "segredo");
    if (dono !== undefined) writeFileSync(join(d, ".dono"), dono);
    const t = new Date(Date.now() - idadeMs);
    utimesSync(d, t, t);
    return d;
  };
  const morto = spawnSync(NODE, ["-e", "0"]).pid;
  const mortoDir = mk("keyring-AbCdE1", String(morto));
  const vivoDir = mk("keyring-AbCdE2", String(process.pid));
  const semDonoDir = mk("keyring-AbCdE3");
  const abrirVelho = mk("keyring-abrir-XyZ123", undefined, 3_600_000);
  const abrirNovo = mk("keyring-abrir-XyZ124", undefined, 60_000);
  const deOutro = mk("keyring-cmd-QwErTy", String(morto), 3_600_000);
  assert.equal(limparResiduos(base), 2);
  assert.ok(!existsSync(mortoDir) && !existsSync(abrirVelho));
  assert.ok(existsSync(vivoDir) && existsSync(semDonoDir) && existsSync(abrirNovo) && existsSync(deOutro));
  rmSync(base, { recursive: true, force: true });
});
