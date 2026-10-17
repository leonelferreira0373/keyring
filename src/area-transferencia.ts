import { spawn } from "node:child_process";

/**
 * O PowerShell (STA, escondido, e que continua a correr depois de nós sairmos) põe o texto na área de transferência FORA
 * do histórico do Windows e da sincronização, espera `segundos` e só limpa se ainda for o mesmo texto (não apaga o que o
 * utilizador copiou entretanto). O texto vai por stdin em base64: nunca na linha de comandos.
 * NÃO usar `detached: true`: no Windows o PowerShell sai logo, sem correr o script (medido: 0,2 s, nada na área de transferência).
 */
const SCRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$v = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()))",
  "$d = New-Object System.Windows.Forms.DataObject",
  "$d.SetText($v)",
  "$d.SetData('CanIncludeInClipboardHistory', (New-Object System.IO.MemoryStream(,[byte[]](0,0,0,0))))",
  "$d.SetData('ExcludeClipboardContentFromMonitorProcessing', (New-Object System.IO.MemoryStream(,[byte[]](1,0,0,0))))",
  "[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)",
  "Start-Sleep -Seconds ([int]$env:KEYRING_SEGUNDOS)",
  "if ([System.Windows.Forms.Clipboard]::ContainsText() -and [System.Windows.Forms.Clipboard]::GetText() -eq $v) { [System.Windows.Forms.Clipboard]::Clear() }",
].join("; ");

export function copiarTemporario(texto: string, segundos: number): void {
  const filho = spawn("powershell.exe", ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", SCRIPT], {
    stdio: ["pipe", "ignore", "ignore"],
    windowsHide: true,
    env: { ...process.env, KEYRING_SEGUNDOS: String(segundos) },
  });
  filho.stdin?.end(Buffer.from(texto, "utf8").toString("base64"));
  filho.unref();
}
