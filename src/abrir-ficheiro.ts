import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nomeSeguro } from "./modelo.ts";
import { restringirAoUtilizador } from "./util.ts";

/** Escreve o ficheiro numa pasta temporária que é só do utilizador. */
export function prepararParaAbrir(nomeOriginal: string, dados: Buffer): { pasta: string; caminho: string } {
  const pasta = mkdtempSync(join(tmpdir(), "keyring-abrir-"));
  restringirAoUtilizador(pasta);
  const caminho = join(pasta, nomeSeguro(nomeOriginal));
  writeFileSync(caminho, dados, { mode: 0o600 });
  return { pasta, caminho };
}

/** Um PowerShell escondido que continua depois de nós sairmos. Sem `detached`: no Windows ele faria o PowerShell sair logo, sem correr nada. */
function destacado(script: string, env: Record<string, string>): void {
  spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ...env },
  }).unref();
}

/** Abre na aplicação do Windows; um processo à parte apaga a pasta passados `minutos`. O caminho vai por variável de ambiente (sem aspas). */
export function abrirTemporario(nomeOriginal: string, dados: Buffer, minutos = 10): string {
  const { pasta, caminho } = prepararParaAbrir(nomeOriginal, dados);
  destacado("Start-Process -FilePath $env:KEYRING_ABRIR", { KEYRING_ABRIR: caminho });
  destacado("Start-Sleep -Seconds ([int]$env:KEYRING_ESPERA); Remove-Item -LiteralPath $env:KEYRING_LIMPAR -Recurse -Force -ErrorAction SilentlyContinue", {
    KEYRING_ESPERA: String(minutos * 60),
    KEYRING_LIMPAR: pasta,
  });
  return caminho;
}
