import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "src", "cli.ts");

test("ao arrancar, o programa limpa as pastas de abrir que ficaram esquecidas no temporário", { skip: process.platform !== "win32", timeout: 60_000 }, () => {
  const temp = mkdtempSync(join(tmpdir(), "keyring-e2e-temp-"));
  const dados = mkdtempSync(join(tmpdir(), "keyring-e2e-"));
  try {
    const velha = join(temp, "keyring-abrir-ZzZ999");
    mkdirSync(velha);
    writeFileSync(join(velha, "chave.pem"), "segredo esquecido");
    const t = new Date(Date.now() - 3_600_000);
    utimesSync(velha, t, t);
    const r = spawnSync(process.execPath, [CLI, "ajuda-ia"], { env: { ...process.env, KEYRING_DIR: dados, TEMP: temp, TMP: temp }, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(velha), "a pasta esquecida tinha de ter sido apagada ao arrancar");
  } finally {
    rmSync(temp, { recursive: true, force: true });
    rmSync(dados, { recursive: true, force: true });
  }
});
