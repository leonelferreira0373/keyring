import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { prepararParaAbrir } from "../src/abrir-ficheiro.ts";

test("prepararParaAbrir escreve o ficheiro com nome seguro numa pasta privada", () => {
  const { pasta, caminho } = prepararParaAbrir("..\\..\\relatório: final?.txt", Buffer.from("conteúdo"));
  assert.equal(readFileSync(caminho, "utf8"), "conteúdo");
  assert.equal(dirname(caminho), pasta);
  assert.ok(!basename(caminho).includes("..") && !/[:?]/.test(basename(caminho)), basename(caminho));
  if (process.platform === "win32") {
    const acl = execFileSync("icacls", [pasta], { encoding: "utf8", windowsHide: true });
    assert.ok(!/BUILTIN\\Users|Everyone|Utilizadores|Authenticated Users/i.test(acl), `a pasta devia ser só do utilizador:\n${acl}`);
  }
  rmSync(pasta, { recursive: true, force: true });
  assert.ok(!existsSync(caminho));
});
