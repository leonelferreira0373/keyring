import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** `correr` com ficheiros: `keyring-` + 6 caracteres do `mkdtemp`, com um `.dono` (o pid do processo que os usa). */
const PASTA_CORRER = /^keyring-[A-Za-z0-9]{6}$/;
/** `abrir`: `keyring-abrir-` + 6 caracteres; um processo à parte apaga-a aos 10 minutos, aqui apanha-se o que sobrou. */
const PASTA_ABRIR = /^keyring-abrir-[A-Za-z0-9]{6}$/;
const IDADE_ABRIR_MS = 30 * 60_000;

function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // existe, mas não é nosso
  }
}

/**
 * Apaga do temporário os ficheiros com segredos que um processo morto deixou (Ctrl+C, um agente de IA a matar um comando, reinício).
 * Só toca no que tem exactamente o nome e a marca que o próprio programa põe. Devolve quantas pastas apagou. Nunca falha.
 */
export function limparResiduos(base = tmpdir(), agora = Date.now()): number {
  let n = 0;
  let nomes: string[];
  try {
    nomes = readdirSync(base);
  } catch {
    return 0;
  }
  for (const nome of nomes) {
    const pasta = join(base, nome);
    try {
      if (PASTA_CORRER.test(nome)) {
        const pid = Number(readFileSync(join(pasta, ".dono"), "utf8").trim());
        if (!Number.isInteger(pid) || pid <= 0 || processoVivo(pid)) continue;
      } else if (PASTA_ABRIR.test(nome)) {
        if (agora - statSync(pasta).mtimeMs < IDADE_ABRIR_MS) continue;
      } else {
        continue;
      }
      rmSync(pasta, { recursive: true, force: true });
      n += 1;
    } catch {
      // sem `.dono`, desapareceu ou está em uso: deixa-se
    }
  }
  return n;
}
