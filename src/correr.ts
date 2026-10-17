import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErroKeyring } from "./erro.ts";
import type { ItemResolvido } from "./gavetas.ts";
import { nomeSeguro } from "./modelo.ts";
import { Redator } from "./redator.ts";
import { restringirAoUtilizador } from "./util.ts";

/** Texto (os nossos avisos) ou bytes (a saída do comando, que não é necessariamente UTF-8). */
export interface Saidas {
  out: { write(t: string | Buffer): unknown };
  err: { write(t: string | Buffer): unknown };
}

export interface Preparo {
  env: Record<string, string>;
  segredos: string[];
  avisos: string[];
  limpar(): void;
}

/** Os valores vão para variáveis de ambiente; os ficheiros para uma pasta temporária privada (o caminho vai na variável). */
export function prepararAmbiente(itens: ItemResolvido[]): Preparo {
  const env: Record<string, string> = {};
  const segredos: string[] = [];
  const avisos: string[] = [];
  let pasta: string | undefined;
  let n = 0;
  for (const { gaveta, item } of itens) {
    if (item.tipo === "nota") continue;
    if (!item.env) {
      avisos.push(`«${item.nome}» (gaveta ${gaveta.numero}) não tem variável de ambiente (--env); não foi injectado.`);
      continue;
    }
    if (item.estado === "revogado") {
      avisos.push(`«${item.nome}» está revogado; não foi injectado.`);
      continue;
    }
    if (item.estado === "rodar") avisos.push(`«${item.nome}» está marcado «rodar»; foi injectado, mas convém rodá-lo.`);
    const conteudo = gaveta.lerItem(item.nome);
    if (item.tipo === "valor") {
      const v = conteudo.toString("utf8");
      env[item.env] = v;
      segredos.push(v);
    } else {
      if (!pasta) {
        pasta = mkdtempSync(join(tmpdir(), "keyring-"));
        restringirAoUtilizador(pasta);
        // a marca de quem usa a pasta: se o processo morrer sem a apagar, `limparResiduos` apanha-a no arranque seguinte
        writeFileSync(join(pasta, ".dono"), String(process.pid));
      }
      const caminho = join(pasta, `${n++}-${nomeSeguro(item.ficheiro?.nomeOriginal ?? item.nome)}`);
      writeFileSync(caminho, conteudo, { mode: 0o600 });
      env[item.env] = caminho;
    }
  }
  return {
    env,
    segredos,
    avisos,
    limpar: () => {
      if (pasta) rmSync(pasta, { recursive: true, force: true });
    },
  };
}

function lancar(comando: string[], env: Record<string, string>, segredos: string[], s: Saidas, comShell: boolean): Promise<number> {
  return new Promise((resolver) => {
    const filho = spawn(comando[0], comando.slice(1), {
      env: { ...process.env, ...env },
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
      shell: comShell,
    });
    // a saída é tratada como bytes (latin1 é 1 para 1): o que não é UTF-8 passa intacto e os segredos procuram-se pelos seus bytes
    const bytes = segredos.map((v) => Buffer.from(v, "utf8").toString("latin1"));
    const rOut = new Redator(bytes);
    const rErr = new Redator(bytes);
    const escrever = (para: Saidas["out"], t: string): void => {
      if (t) para.write(Buffer.from(t, "latin1"));
    };
    filho.stdout?.on("data", (b: Buffer) => escrever(s.out, rOut.empurrar(b.toString("latin1"))));
    filho.stderr?.on("data", (b: Buffer) => escrever(s.err, rErr.empurrar(b.toString("latin1"))));
    filho.on("error", (e: NodeJS.ErrnoException) => {
      // no Windows, `npm`, `echo`… não são executáveis directos: tenta-se uma vez através da shell
      if (e.code === "ENOENT" && !comShell && process.platform === "win32") {
        resolver(lancar(comando, env, segredos, s, true));
        return;
      }
      s.err.write(`erro: não consegui correr «${comando[0]}»: ${e.message}\n`);
      resolver(127);
    });
    filho.on("close", (codigo, sinal) => {
      escrever(s.out, rOut.fim());
      escrever(s.err, rErr.fim());
      resolver(codigo ?? (sinal ? 1 : 0));
    });
  });
}

/** Corre o comando com os segredos só dentro desse processo e devolve o código de saída. A saída vai censurada. */
export async function correr(itens: ItemResolvido[], comando: string[], s: Saidas): Promise<number> {
  if (comando.length === 0) {
    throw new ErroKeyring("comando", "Falta o comando a correr: keyring sudo <gaveta> correr -- <comando>.");
  }
  const preparo = prepararAmbiente(itens);
  for (const a of preparo.avisos) s.err.write(`aviso: ${a}\n`);
  try {
    return await lancar(comando, preparo.env, preparo.segredos, s, false);
  } finally {
    preparo.limpar();
  }
}
