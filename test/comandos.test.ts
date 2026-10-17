import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executar, juntarPlicas, type Ambiente } from "../src/comandos.ts";
import { novaChave } from "../src/cripto.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

const SEGREDO = "VALOR-SECRETO-777888";

interface Opcoes {
  raiz?: string;
  tranca?: TrancaDeTeste;
  terminal?: boolean;
  stdin?: string;
  oculto?: string[];
  env?: Record<string, string>;
}

function criar(o: Opcoes = {}) {
  const raiz = o.raiz ?? mkdtempSync(join(tmpdir(), "keyring-cmd-"));
  const tranca = o.tranca ?? new TrancaDeTeste(novaChave());
  const out: string[] = [];
  const err: string[] = [];
  const binario: Buffer[] = [];
  const copias: string[] = [];
  const abertos: string[] = [];
  const relogio = { t: 10_000_000 };
  const oculto = [...(o.oculto ?? ["1234"])];
  const amb: Ambiente = {
    raiz,
    tranca,
    out: { write: (t) => out.push(String(t)) },
    err: { write: (t) => err.push(String(t)) },
    saidaEhTerminal: o.terminal ?? false,
    env: o.env ?? {},
    agora: () => relogio.t,
    esperar: () => {},
    lerStdinTudo: async () => Buffer.from(o.stdin ?? ""),
    lerOculto: async () => oculto.shift() ?? "",
    escreverBinario: (b) => void binario.push(b),
    copiar: (t) => void copias.push(t),
    abrirTemporario: (nome) => void abertos.push(nome),
  };
  return { amb, raiz, tranca, relogio, binario, copias, abertos, texto: () => out.join(""), erros: () => err.join(""), limpar: () => rmSync(raiz, { recursive: true, force: true }) };
}
type C = ReturnType<typeof criar>;
const k = (c: C, ...args: string[]) => executar(args, c.amb);

test("keyring ls sem gavetas diz como começar; sem sudo", async () => {
  const c = criar();
  assert.equal(await k(c, "ls"), 0);
  assert.match(c.texto(), /Nenhuma gaveta ainda.*keyring sudo criar/s);
  c.limpar();
});

test("um comando privilegiado sem sudo é recusado e diz o que fazer", async () => {
  const c = criar();
  assert.equal(await k(c, "por", "x"), 1);
  assert.match(c.erros(), /sudo/);
  assert.equal(await k(c, "foo"), 1);
  assert.match(c.erros(), /Comando desconhecido «foo»/);
  c.limpar();
});

test("sudo: pede a password (1234 por omissão), avisa que é a predefinida, e abre a sessão", async () => {
  const c = criar();
  assert.equal(await k(c, "sudo"), 0);
  assert.match(c.texto(), /Sessão sudo aberta/);
  assert.match(c.erros(), /predefinida/);
  c.limpar();
});

test("sudo: password errada dá erro e não abre; KEYRING_SENHA e a sessão em cache dispensam o prompt", async () => {
  const errada = criar({ oculto: ["0000"] });
  assert.equal(await k(errada, "sudo"), 1);
  assert.match(errada.erros(), /Password errada/);
  errada.limpar();
  const c = criar({ env: { KEYRING_SENHA: "1234" }, oculto: [] });
  assert.equal(await k(c, "sudo", "criar", "acme", "--entidade", "AC"), 0);
  assert.equal(await k(c, "sudo", "acme", "ls"), 0, "a sessão em cache dispensa a password");
  c.limpar();
});

test("sudo -k fecha a sessão; sudo passwd muda a password", async () => {
  const c = criar({ oculto: ["1234", "1234", "nova-senha", "nova-senha"] });
  await k(c, "sudo");
  assert.equal(await k(c, "sudo", "-k"), 0);
  assert.equal(await k(c, "sudo", "passwd"), 0);
  assert.match(c.texto(), /Password mudada/);
  const c2 = criar({ raiz: c.raiz, tranca: c.tranca, oculto: ["1234"] });
  assert.equal(await k(c2, "sudo"), 1, "a 1234 já não serve");
  c.limpar();
});

test("criar numera em sequência e ls lista as gavetas", async () => {
  const c = criar();
  await k(c, "sudo", "criar", "Acme Corp", "--entidade", "AC");
  await k(c, "sudo", "criar", "Globex");
  assert.equal(await k(c, "ls"), 0);
  assert.match(c.texto(), /1\s+Acme Corp\s+AC/);
  assert.match(c.texto(), /2\s+Globex/);
  c.limpar();
});

test("pôr guarda um valor lido de stdin; ls esconde o valor se a saída não é um terminal", async () => {
  const c = criar({ stdin: `${SEGREDO}\n` });
  await k(c, "sudo", "criar", "acme");
  assert.equal(await k(c, "sudo", "acme", "pôr", "api.token", "--stdin", "--env", "API_TOKEN", "--descricao", "token de teste"), 0);
  assert.ok(!c.texto().includes(SEGREDO) && !c.erros().includes(SEGREDO), "guardar nunca imprime o valor");
  const antes = c.texto().length;
  assert.equal(await k(c, "sudo", "acme", "ls"), 0);
  const listagem = c.texto().slice(antes);
  assert.match(listagem, /api\.token\s+valor\s+ok\s+env=API_TOKEN/);
  assert.ok(!listagem.includes(SEGREDO));
  assert.match(listagem, /\*\*\*\(\d+\)/);
  c.limpar();
});

test("--stdin sem sessão aberta não deixa a password comer o valor: erro claro", async () => {
  const c = criar({ stdin: SEGREDO });
  assert.equal(await k(c, "sudo", "acme", "por", "x", "--stdin"), 1);
  assert.match(c.erros(), /echo 1234 | keyring sudo/);
  c.limpar();
});

test("ls mostra os valores com --mostrar ou quando a saída é um terminal", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "x", "--stdin");
  const a = c.texto().length;
  await k(c, "sudo", "acme", "ls", "--mostrar");
  assert.ok(c.texto().slice(a).includes(SEGREDO));
  const t = criar({ raiz: c.raiz, tranca: c.tranca, terminal: true, oculto: ["1234"] });
  await k(t, "sudo", "acme", "ls");
  assert.ok(t.texto().includes(SEGREDO));
  c.limpar();
});

test("nomes entre plicas, aspas tipográficas e acentos agudos, também partidos como o cmd.exe os deixa", async () => {
  const c = criar();
  await k(c, "sudo", "criar", "Acme Corp");
  for (const ref of [["'Acme Corp'"], ["´acme corp´"], ["“ACME CORP”"], ["'Acme", "Corp'"], ["1"]]) {
    const a = c.texto().length;
    assert.equal(await k(c, "sudo", ...ref, "ls"), 0, ref.join(" "));
    assert.match(c.texto().slice(a), /Gaveta 1 — Acme Corp/);
  }
  assert.deepEqual(juntarPlicas(["'a", "b'", "c", "´d", "e", "f´"]), ["'a b'", "c", "´d e f´"]);
  c.limpar();
});

test("rec txt escreve a gaveta toda, valores incluídos, na saída ou num ficheiro", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme", "--entidade", "AC");
  await k(c, "sudo", "acme", "por", "x", "--stdin");
  const a = c.texto().length;
  assert.equal(await k(c, "sudo", "acme", "rec", "txt"), 0);
  assert.ok(c.texto().slice(a).includes(`valor: ${SEGREDO}`));
  assert.match(c.erros(), /segredos em texto simples/);
  const destino = join(c.raiz, "..", `rec-${Date.now()}.txt`);
  assert.equal(await k(c, "sudo", "acme", "rec", "txt", destino), 0);
  assert.ok(readFileSync(destino, "utf8").includes(SEGREDO));
  rmSync(destino, { force: true });
  c.limpar();
});

test("rec pdf: uma gaveta para a saída (binário), ou para um ficheiro; num terminal recusa-se a despejar binário", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "x", "--stdin");
  assert.equal(await k(c, "sudo", "acme", "rec", "pdf"), 0);
  assert.equal(c.binario.length, 1);
  assert.ok(c.binario[0].subarray(0, 5).toString() === "%PDF-");
  assert.equal(await k(c, "sudo", "acme", "rec"), 0, "sem formato, rec faz PDF");
  assert.equal(c.binario.length, 2);
  const pdf = join(c.raiz, "..", `um-${Date.now()}.pdf`);
  assert.equal(await k(c, "sudo", "acme", "rec", "pdf", pdf), 0);
  assert.ok(readFileSync(pdf).subarray(0, 5).toString() === "%PDF-");
  rmSync(pdf, { force: true });
  const t = criar({ raiz: c.raiz, tranca: c.tranca, terminal: true, oculto: ["1234"] });
  assert.equal(await k(t, "sudo", "acme", "rec", "pdf"), 1);
  assert.match(t.erros(), /binário/);
  c.limpar();
});

test("rec de várias gavetas: um PDF por gaveta, numa pasta; sem pasta dá erro claro", async () => {
  const c = criar();
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "criar", "Globex");
  const pasta = join(c.raiz, "..", `pdfs-${Date.now()}`);
  assert.equal(await k(c, "sudo", "'acme'", "´Globex´", "rec", "pdf", pasta), 0);
  assert.deepEqual(readdirSync(pasta).sort(), ["Globex.pdf", "acme.pdf"]);
  assert.ok(readFileSync(join(pasta, "acme.pdf")).subarray(0, 5).toString() === "%PDF-");
  rmSync(pasta, { recursive: true, force: true });
  assert.equal(await k(c, "sudo", "acme", "Globex", "rec", "pdf"), 1);
  assert.match(c.erros(), /pasta/);
  c.limpar();
});

test("correr: o comando vê o segredo, a saída vê ***", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "seg", "--stdin", "--env", "MEU_SEG");
  const a = c.texto().length;
  const codigo = await k(c, "sudo", "acme", "correr", "--", process.execPath, "-e", "process.stdout.write(process.env.MEU_SEG)");
  assert.equal(codigo, 0);
  assert.equal(c.texto().slice(a), "***");
  c.limpar();
});

test("projecto: cria, junta itens de gavetas diferentes e corre com todos", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "a");
  await k(c, "sudo", "criar", "b");
  await k(c, "sudo", "a", "por", "um", "--stdin", "--env", "UM");
  await k(c, "sudo", "b", "por", "dois", "--stdin", "--env", "DOIS");
  assert.equal(await k(c, "sudo", "projecto", "criar", "bc", "--descricao", "Acme Website"), 0);
  assert.equal(await k(c, "sudo", "projecto", "adicionar", "bc", "1/um", "2/dois"), 0);
  const a = c.texto().length;
  assert.equal(await k(c, "sudo", "projecto", "bc", "correr", "--", process.execPath, "-e", "process.stdout.write(Object.keys(process.env).filter((n) => n === 'UM' || n === 'DOIS').sort().join(','))"), 0);
  assert.equal(c.texto().slice(a), "DOIS,UM");
  c.limpar();
});

test("estado, remover, tirar, copiar, abrir e ficha", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "x", "--stdin");
  assert.equal(await k(c, "sudo", "acme", "estado", "x", "rodar"), 0);
  await k(c, "sudo", "acme", "ls");
  assert.match(c.texto(), /x\s+valor\s+rodar/);
  assert.equal(await k(c, "sudo", "acme", "estado", "x", "estragado"), 1);
  assert.equal(await k(c, "sudo", "acme", "copiar", "x"), 0);
  assert.deepEqual(c.copias, [SEGREDO]);
  assert.ok(!c.texto().includes(SEGREDO), "copiar nunca imprime");
  assert.equal(await k(c, "sudo", "acme", "tirar", "x", "lixo"), 1, "um valor não se extrai para ficheiro");
  const origem = join(c.raiz, "..", `orig-${Date.now()}.pem`);
  writeFileSync(origem, "CHAVE FALSA");
  assert.equal(await k(c, "sudo", "acme", "por", "chave", origem), 0);
  const pasta = join(c.raiz, "..", `saida-${Date.now()}`);
  mkdirSync(pasta);
  assert.equal(await k(c, "sudo", "acme", "tirar", "chave", pasta), 0);
  assert.equal(readFileSync(join(pasta, readdirSync(pasta)[0]), "utf8"), "CHAVE FALSA");
  assert.equal(await k(c, "sudo", "acme", "abrir", "chave"), 0);
  assert.equal(c.abertos.length, 1);
  assert.equal(await k(c, "sudo", "acme", "remover", "x"), 0);
  const ficha = join(c.raiz, "..", `ficha-${Date.now()}.md`);
  writeFileSync(ficha, "Empresa de teste.");
  assert.equal(await k(c, "sudo", "acme", "ficha", "--de", ficha), 0);
  const a = c.texto().length;
  await k(c, "sudo", "acme", "ficha");
  assert.match(c.texto().slice(a), /Empresa de teste\./);
  rmSync(origem, { force: true });
  rmSync(ficha, { force: true });
  rmSync(pasta, { recursive: true, force: true });
  c.limpar();
});

test("o índice (keyring sem argumentos) nunca tem valores; --json é JSON válido", async () => {
  const c = criar({ stdin: SEGREDO });
  await k(c, "sudo", "criar", "acme", "--entidade", "AC");
  await k(c, "sudo", "acme", "por", "seg", "--stdin", "--env", "SEG");
  const a = c.texto().length;
  assert.equal(await k(c), 0);
  const indice = c.texto().slice(a);
  assert.match(indice, /GAVETA 1 — acme \(AC\)/);
  assert.ok(!indice.includes(SEGREDO));
  const b = c.texto().length;
  assert.equal(await k(c, "--json"), 0);
  const json = JSON.parse(c.texto().slice(b));
  assert.equal(json.gavetas[0].itens[0].nome, "seg");
  assert.ok(!c.texto().slice(b).includes(SEGREDO));
  c.limpar();
});

test("erros em JSON vão para o stderr com código; opções desconhecidas e gavetas que não existem são claras", async () => {
  const c = criar();
  await k(c, "sudo", "criar", "acme");
  assert.equal(await k(c, "sudo", "9", "ls", "--json"), 1);
  assert.deepEqual(JSON.parse(c.erros().trim().split("\n").pop() ?? "{}").erro.codigo, "gaveta");
  assert.equal(await k(c, "sudo", "acme", "ls", "--invento"), 1);
  assert.match(c.erros(), /Opção desconhecida/);
  c.limpar();
});

test("keyring ajuda-ia imprime o guia e as regras", async () => {
  const c = criar();
  assert.equal(await k(c, "ajuda-ia"), 0);
  assert.match(c.texto(), /NUNCA imprimas um valor secreto/);
  assert.match(c.texto(), /keyring sudo <gaveta> correr/);
  c.limpar();
});

test("exportar e importar pela linha de comandos, com a frase vinda do ambiente", async () => {
  const c = criar({ stdin: SEGREDO, env: { KEYRING_FRASE: "frase-passe-longa" } });
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "x", "--stdin", "--env", "X_VALOR");
  const destino = join(c.raiz, "..", `copia-${Date.now()}.keyring`);
  assert.equal(await k(c, "sudo", "acme", "exportar", destino), 0);
  const outro = criar({ env: { KEYRING_FRASE: "frase-passe-longa", KEYRING_SENHA: "1234" } });
  assert.equal(await k(outro, "sudo", "importar", destino), 0);
  assert.match(outro.texto(), /Importada a gaveta 1: acme \(1 itens\)/);
  const a = outro.texto().length;
  await k(outro, "sudo", "acme", "correr", "--", process.execPath, "-e", "process.stdout.write(process.env.X_VALOR)");
  assert.equal(outro.texto().slice(a), "***");
  rmSync(destino, { force: true });
  c.limpar();
  outro.limpar();
});
