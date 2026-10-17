import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cifrar, decifrar } from "./cripto.ts";
import { ErroKeyring } from "./erro.ts";
import { escreverAtomico } from "./util.ts";

const ID_BLOB = /^[0-9a-f-]{36}$/;
/** Uma escrita demora milissegundos; um temporário com mais de 10 minutos é de um processo que morreu. */
const IDADE_MINIMA_TEMPORARIO_MS = 10 * 60_000;

function verificarId(id: string): void {
  if (!ID_BLOB.test(id)) throw new ErroKeyring("id", "Identificador de item inválido.");
}

/** Uma pasta cifrada com uma chave: documentos JSON e blobs. O nome do ficheiro faz parte do que está autenticado. */
export class Cofre {
  dir: string;
  chave: Buffer;

  constructor(dir: string, chave: Buffer) {
    this.dir = dir;
    this.chave = chave;
  }

  lerJson<T>(nome: string): T | undefined {
    const caminho = join(this.dir, nome);
    if (!existsSync(caminho)) return undefined;
    return JSON.parse(decifrar(this.chave, readFileSync(caminho), `json:${nome}`).toString("utf8")) as T;
  }

  escreverJson(nome: string, valor: unknown): void {
    escreverAtomico(join(this.dir, nome), cifrar(this.chave, Buffer.from(JSON.stringify(valor), "utf8"), `json:${nome}`));
  }

  lerBlob(id: string): Buffer {
    verificarId(id);
    return decifrar(this.chave, readFileSync(join(this.dir, "itens", `${id}.enc`)), `blob:${id}`);
  }

  escreverBlob(id: string, dados: Buffer): void {
    verificarId(id);
    escreverAtomico(join(this.dir, "itens", `${id}.enc`), cifrar(this.chave, dados, `blob:${id}`));
  }

  apagarBlob(id: string): void {
    verificarId(id);
    rmSync(join(this.dir, "itens", `${id}.enc`), { force: true });
  }

  /**
   * Remove os `*.tmp-*` que um processo morto a meio de uma escrita possa ter deixado. Devolve quantos.
   * Só os velhos: um temporário recente é de uma escrita a decorrer noutro processo (apagá-lo faria falhar essa escrita).
   */
  limparTemporarios(agora = Date.now()): number {
    let n = 0;
    for (const pasta of [this.dir, join(this.dir, "itens")]) {
      if (!existsSync(pasta)) continue;
      for (const f of readdirSync(pasta)) {
        if (!/\.tmp-[0-9a-f]+$/.test(f)) continue;
        const caminho = join(pasta, f);
        try {
          if (agora - statSync(caminho).mtimeMs < IDADE_MINIMA_TEMPORARIO_MS) continue;
          rmSync(caminho, { force: true });
          n += 1;
        } catch {
          // desapareceu entretanto (o outro processo acabou a escrita): nada a fazer
        }
      }
    }
    return n;
  }
}
