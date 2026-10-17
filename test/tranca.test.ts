import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { novaChave } from "../src/cripto.ts";
import { TrancaDeTeste, TrancaWindows } from "../src/tranca.ts";

test("TrancaDeTeste: ida e volta; outra chave recusa", () => {
  const t = new TrancaDeTeste(novaChave());
  const dados = randomBytes(32);
  assert.ok(t.destrancar(t.trancar(dados)).equals(dados));
  assert.throws(() => new TrancaDeTeste(novaChave()).destrancar(t.trancar(dados)));
});

test("TrancaWindows: ida e volta com o DPAPI a sério", { skip: process.platform !== "win32" }, () => {
  const t = new TrancaWindows();
  const chave = randomBytes(32);
  const trancada = t.trancar(chave);
  assert.ok(trancada.length > 32, "a chave trancada tem de ser maior (cabeçalho do DPAPI)");
  assert.ok(!trancada.includes(chave), "a chave não pode aparecer em claro dentro da trancada");
  assert.ok(t.destrancar(trancada).equals(chave));
});

test("TrancaWindows: o que o Windows não reconhece dá a mensagem em português da recuperação", { skip: process.platform !== "win32" }, () => {
  const t = new TrancaWindows();
  assert.throws(
    () => t.destrancar(Buffer.from("isto não foi trancado pelo Windows")),
    (e: unknown) => {
      const erro = e as { codigo?: string; message?: string };
      return erro.codigo === "dpapi" && /importar/.test(erro.message ?? "") && /Windows/.test(erro.message ?? "");
    },
  );
});
