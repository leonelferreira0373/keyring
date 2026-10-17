import { execFileSync } from "node:child_process";
import { cifrar, decifrar } from "./cripto.ts";
import { ErroKeyring } from "./erro.ts";

/** Quem tranca e destranca a chave-raiz. Em produção é o Windows; nos testes, uma chave em memória. */
export interface Tranca {
  trancar(dados: Buffer): Buffer;
  destrancar(dados: Buffer): Buffer;
}

const ENTRADA = "Add-Type -AssemblyName System.Security; $e=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());";
const ESCOPO = "[Security.Cryptography.DataProtectionScope]::CurrentUser";

/** Os dados entram por stdin em base64 (nunca na linha de comandos) e saem em base64. */
function powershell(script: string, entrada: Buffer): Buffer {
  const saida = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: entrada.toString("base64"),
    encoding: "utf8",
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return Buffer.from(saida.trim(), "base64");
}

/** DPAPI do Windows, escopo do utilizador actual: só esta conta do Windows abre o que trancou. */
export class TrancaWindows implements Tranca {
  trancar(dados: Buffer): Buffer {
    return powershell(`${ENTRADA} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($e,$null,${ESCOPO}))`, dados);
  }
  destrancar(dados: Buffer): Buffer {
    try {
      return powershell(`${ENTRADA} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($e,$null,${ESCOPO}))`, dados);
    } catch {
      throw new ErroKeyring(
        "dpapi",
        "Esta sessão do Windows não consegue abrir as gavetas: foram trancadas por outro utilizador ou noutro PC. Use `keyring sudo importar <ficheiro>` com a cópia de recuperação.",
      );
    }
  }
}

/** Só para testes: tranca com uma chave fixa em memória. Nunca usar fora dos testes. */
export class TrancaDeTeste implements Tranca {
  chave: Buffer;
  constructor(chave: Buffer) {
    this.chave = chave;
  }
  trancar(dados: Buffer): Buffer {
    return cifrar(this.chave, dados, "tranca-teste");
  }
  destrancar(dados: Buffer): Buffer {
    return decifrar(this.chave, dados, "tranca-teste");
  }
}
