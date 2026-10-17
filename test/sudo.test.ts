import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cofre } from "../src/cofre.ts";
import { novaChave } from "../src/cripto.ts";
import { Sudo } from "../src/sudo.ts";

const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;
const MIN = 60_000;

function novo() {
  const dir = mkdtempSync(join(tmpdir(), "keyring-sudo-"));
  const relogio = { t: 1_000_000 };
  const esperas: number[] = [];
  const sudo = new Sudo(new Cofre(dir, novaChave()), { agora: () => relogio.t, esperar: (ms) => void esperas.push(ms) });
  return { dir, sudo, relogio, esperas };
}

test("a password predefinida é 1234 e abre uma sessão de 15 minutos", () => {
  const { dir, sudo, relogio } = novo();
  assert.equal(sudo.sessaoAberta(), false);
  assert.equal(sudo.predefinida(), true);
  sudo.entrar("1234");
  assert.equal(sudo.sessaoAberta(), true);
  relogio.t += 15 * MIN - 1;
  assert.equal(sudo.sessaoAberta(), true);
  relogio.t += 2;
  assert.equal(sudo.sessaoAberta(), false);
  assert.throws(() => sudo.exigir(), codigo("sudo"));
  rmSync(dir, { recursive: true, force: true });
});

test("uma password errada espera 1,5 s e não abre a sessão", () => {
  const { dir, sudo, esperas } = novo();
  assert.throws(() => sudo.entrar("0000"), codigo("senha"));
  assert.deepEqual(esperas, [1500]);
  assert.equal(sudo.sessaoAberta(), false);
  rmSync(dir, { recursive: true, force: true });
});

test("5 falhas seguidas bloqueiam 5 minutos, mesmo com a password certa", () => {
  const { dir, sudo, relogio } = novo();
  for (let i = 0; i < 5; i++) assert.throws(() => sudo.entrar("x"), codigo("senha"));
  assert.throws(() => sudo.entrar("1234"), codigo("bloqueado"));
  relogio.t += 5 * MIN - 1;
  assert.throws(() => sudo.entrar("1234"), codigo("bloqueado"));
  relogio.t += 2;
  sudo.entrar("1234");
  assert.equal(sudo.sessaoAberta(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("um acerto zera as falhas: 4 erros, 1 certo, 4 erros não bloqueia", () => {
  const { dir, sudo } = novo();
  for (let i = 0; i < 4; i++) assert.throws(() => sudo.entrar("x"), codigo("senha"));
  sudo.entrar("1234");
  sudo.sair();
  for (let i = 0; i < 4; i++) assert.throws(() => sudo.entrar("x"), codigo("senha"));
  sudo.entrar("1234");
  assert.equal(sudo.sessaoAberta(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("sair fecha a sessão; --minutos muda a duração", () => {
  const { dir, sudo, relogio } = novo();
  sudo.entrar("1234", 60);
  relogio.t += 59 * MIN;
  assert.equal(sudo.sessaoAberta(), true);
  sudo.sair();
  assert.equal(sudo.sessaoAberta(), false);
  rmSync(dir, { recursive: true, force: true });
});

test("mudarSenha: exige a antiga, recusa passwords curtas, e a nova substitui a 1234", () => {
  const { dir, sudo } = novo();
  assert.throws(() => sudo.mudarSenha("errada", "nova-senha"), codigo("senha"));
  assert.throws(() => sudo.mudarSenha("1234", "abc"), codigo("senha-curta"));
  sudo.mudarSenha("1234", "nova-senha");
  assert.equal(sudo.predefinida(), false);
  assert.throws(() => sudo.entrar("1234"), codigo("senha"));
  sudo.entrar("nova-senha");
  assert.equal(sudo.sessaoAberta(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("o estado vive no cofre: outra instância vê a mesma sessão", () => {
  const dir = mkdtempSync(join(tmpdir(), "keyring-sudo-"));
  const chave = novaChave();
  const relogio = { t: 5_000_000 };
  const a = new Sudo(new Cofre(dir, chave), { agora: () => relogio.t, esperar: () => {} });
  const b = new Sudo(new Cofre(dir, chave), { agora: () => relogio.t, esperar: () => {} });
  a.entrar("1234");
  assert.equal(b.sessaoAberta(), true);
  b.sair();
  assert.equal(a.sessaoAberta(), false);
  rmSync(dir, { recursive: true, force: true });
});
