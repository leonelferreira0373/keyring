import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "src", "cli.ts");
const SEGREDO = "e2e-valor-secreto-123456";

test("o programa a sério: criar, guardar, listar escondido, correr censurado, rec em claro, índice", { skip: process.platform !== "win32", timeout: 180_000 }, () => {
  const dados = mkdtempSync(join(tmpdir(), "keyring-e2e-"));
  const env = { ...process.env, KEYRING_DIR: dados, KEYRING_SENHA: "1234" };
  const todas: string[] = [];
  const kr = (args: string[], input = "") => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, input, encoding: "utf8", windowsHide: true });
    todas.push(r.stdout, r.stderr);
    assert.ok(!r.stderr.includes("ExperimentalWarning"), `avisos do Node a sujar a saída: ${r.stderr}`);
    return r;
  };
  try {
    assert.match(kr(["ls"]).stdout, /Nenhuma gaveta ainda/);
    assert.match(kr(["sudo", "criar", "acme", "--entidade", "AC"]).stdout, /Criada a gaveta 1: acme/);
    assert.equal(kr(["sudo", "acme", "por", "seg", "--stdin", "--env", "SEG_E2E"], SEGREDO).status, 0);
    assert.match(kr(["sudo", "acme", "ls"]).stdout, /\*\*\*\(24\)/);
    const correr = kr(["sudo", "acme", "correr", "--", process.execPath, "-e", "process.stdout.write('[' + process.env.SEG_E2E + ']')"]);
    assert.equal(correr.stdout, "[***]");
    assert.equal(correr.status, 0);
    const indice = kr([]);
    assert.match(indice.stdout, /GAVETA 1 — acme \(AC\)/);
    assert.match(kr(["--json"]).stdout, /"numero": 1/);
    const antesDoRec = todas.join("");
    assert.ok(!antesDoRec.includes(SEGREDO), "o valor apareceu na saída de um comando que não é o rec");
    assert.match(kr(["sudo", "acme", "rec", "txt"]).stdout, new RegExp(`valor: ${SEGREDO}`));
    assert.equal(kr(["sudo", "acme", "estado", "seg", "revogado"]).status, 0);
    const revogado = kr(["sudo", "acme", "correr", "--", process.execPath, "-e", "process.stdout.write(String(process.env.SEG_E2E))"]);
    assert.equal(revogado.stdout, "undefined", "um item revogado não se injecta");
  } finally {
    rmSync(dados, { recursive: true, force: true });
  }
});
