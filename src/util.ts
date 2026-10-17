import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { ErroKeyring } from "./erro.ts";

/** A pasta dos dados. `KEYRING_DIR` serve para testes; por omissão `C:\Users\<utilizador>\.keyring`. */
export function raizPorOmissao(): string {
  return process.env.KEYRING_DIR ?? join(homedir(), ".keyring");
}

/** A data local de hoje, AAAA-MM-DD. */
export function hoje(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** Tira à pasta (e ao que vier a nascer dentro dela) o acesso de toda a gente menos o utilizador e o sistema. */
export function restringirAoUtilizador(pasta: string): void {
  if (process.platform !== "win32") return;
  const dominio = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : "";
  const eu = `${dominio}${userInfo().username}`;
  execFileSync(
    "icacls",
    [pasta, "/inheritance:r", "/grant:r", `${eu}:(OI)(CI)F`, "NT AUTHORITY\\SYSTEM:(OI)(CI)F"],
    { stdio: "ignore", windowsHide: true },
  );
}

/** Cria a pasta; se for nova, fica só do utilizador. */
export function pastaPrivada(pasta: string): void {
  const nova = !existsSync(pasta);
  mkdirSync(pasta, { recursive: true });
  if (nova) restringirAoUtilizador(pasta);
}

/** Escreve num temporário e renomeia: uma falha a meio nunca deixa um ficheiro pela metade. */
export function escreverAtomico(caminho: string, dados: Buffer | string): void {
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp-${randomBytes(4).toString("hex")}`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, typeof dados === "string" ? Buffer.from(dados, "utf8") : dados);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, caminho);
}

export function esperar(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Exclusão mútua entre processos (um agente de IA e o dono ao mesmo tempo): cria um ficheiro `wx` na pasta.
 * Um bloqueio com mais de 30 s é de um processo morto e é removido.
 */
export function comBloqueio<T>(pasta: string, fn: () => T, esperaMs = 5000, nome = "keyring.lock"): T {
  mkdirSync(pasta, { recursive: true });
  const caminho = join(pasta, nome);
  const limite = Date.now() + esperaMs;
  for (;;) {
    try {
      closeSync(openSync(caminho, "wx"));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(caminho).mtimeMs > 30_000) {
          rmSync(caminho, { force: true });
          continue;
        }
      } catch {
        continue; // desapareceu entretanto: tenta outra vez
      }
      if (Date.now() > limite) {
        throw new ErroKeyring("ocupada", "A gaveta está a ser usada por outro processo. Tente de novo daqui a um instante.");
      }
      esperar(50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(caminho, { force: true });
  }
}
