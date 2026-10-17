import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executar, type Ambiente } from "../src/comandos.ts";
import { novaChave } from "../src/cripto.ts";
import { TrancaDeTeste } from "../src/tranca.ts";

function criar(stdin = "") {
  const raiz = mkdtempSync(join(tmpdir(), "keyring-revisao-"));
  const out: string[] = [];
  const err: string[] = [];
  const amb: Ambiente = {
    raiz,
    tranca: new TrancaDeTeste(novaChave()),
    out: { write: (t) => out.push(String(t)) },
    err: { write: (t) => err.push(String(t)) },
    saidaEhTerminal: false,
    env: {},
    agora: () => 10_000_000,
    esperar: () => {},
    lerStdinTudo: async () => Buffer.from(stdin),
    lerOculto: async () => "1234",
    escreverBinario: () => {},
    copiar: () => {},
    abrirTemporario: () => {},
  };
  return { amb, raiz, texto: () => out.join(""), erros: () => err.join(""), limpar: () => rmSync(raiz, { recursive: true, force: true }) };
}
type C = ReturnType<typeof criar>;
const k = (c: C, ...args: string[]) => executar(args, c.amb);

test("correr: o --json a seguir ao -- é do comando filho, não do keyring", async () => {
  const c = criar("valor-qualquer-123456");
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "acme", "por", "x.seg", "--stdin", "--env", "X_SEG");
  const antes = c.texto().length;
  const script = "process.stdout.write(JSON.stringify(process.argv.slice(1)))";
  const codigo = await k(c, "sudo", "acme", "correr", "--", process.execPath, "-e", script, "--", "--json", "ola");
  assert.equal(codigo, 0, c.erros());
  assert.equal(c.texto().slice(antes), '["--json","ola"]');
  c.limpar();
});

test("um --json depois do -- não passa os erros do keyring para JSON", async () => {
  const c = criar();
  assert.equal(await k(c, "sudo", "9", "correr", "--", "qualquer", "--json"), 1);
  assert.match(c.erros(), /^erro: Não existe a gaveta 9/m);
  assert.ok(!c.erros().includes('{"erro"'), "o erro não devia vir em JSON");
  c.limpar();
});

test("ls avisa, sem falhar, de uma gaveta que não abre", async () => {
  const c = criar();
  await k(c, "sudo", "criar", "acme");
  await k(c, "sudo", "criar", "estragada");
  rmSync(join(c.raiz, "2", "gaveta.json.enc"));
  assert.equal(await k(c, "ls"), 0);
  assert.match(c.texto(), /acme/);
  assert.match(c.erros(), /aviso: a gaveta 2 não abre/);
  c.limpar();
});

test("ajuda-ia: o exemplo de correr usa bash -c (o $VAR é do filho) e manda confirmar a variável antes de marcar revogado", async () => {
  const c = criar();
  assert.equal(await k(c, "ajuda-ia"), 0);
  const t = c.texto();
  assert.ok(!/correr -- curl[^\n]*"[^"\n]*\$CLOUDFLARE_API_TOKEN/.test(t), "o $VAR entre aspas duplas é expandido pela shell de quem chama, antes do keyring");
  assert.match(t, /correr -- bash -c '[^\n]*\$CLOUDFLARE_API_TOKEN/);
  assert.match(t, /confirma que a variável chegou/);
  c.limpar();
});
