import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copiarTemporario } from "../src/area-transferencia.ts";

function lerArea(): string {
  // a saída do PowerShell tem de ser UTF-8, senão o «çã» chega estragado (página de códigos do Windows) e o teste dá falso negativo
  return execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() }"], { encoding: "utf8", windowsHide: true }).replace(/\r?\n$/, "");
}
function pousar(texto: string): void {
  execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText($env:KEYRING_TEXTO)"], { env: { ...process.env, KEYRING_TEXTO: texto }, windowsHide: true });
}
async function ate(condicao: () => boolean, ms: number): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (condicao()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return condicao();
}

test("copiarTemporario põe o texto na área de transferência e limpa-a ao fim do tempo", { skip: process.platform !== "win32", timeout: 90_000 }, async () => {
  const antes = lerArea();
  const segredo = `KEYRING-TESTE-${Date.now()}-çã`;
  try {
    copiarTemporario(segredo, 5);
    assert.ok(await ate(() => lerArea() === segredo, 15_000), "o texto não chegou à área de transferência");
    assert.ok(await ate(() => lerArea() !== segredo, 25_000), "a área de transferência não foi limpa");
  } finally {
    if (antes) pousar(antes);
  }
});

test("copiarTemporario não limpa o que o utilizador copiou entretanto", { skip: process.platform !== "win32", timeout: 90_000 }, async () => {
  const antes = lerArea();
  const segredo = `KEYRING-TESTE-B-${Date.now()}`;
  try {
    copiarTemporario(segredo, 6);
    assert.ok(await ate(() => lerArea() === segredo, 15_000));
    pousar("outra coisa que copiei");
    await new Promise((r) => setTimeout(r, 12_000));
    assert.equal(lerArea(), "outra coisa que copiei");
  } finally {
    if (antes) pousar(antes);
  }
});
