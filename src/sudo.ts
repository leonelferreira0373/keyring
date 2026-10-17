import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Cofre } from "./cofre.ts";
import { ErroKeyring } from "./erro.ts";
import { comBloqueio, esperar } from "./util.ts";

const FICHEIRO = "sudo.json.enc";
export const SENHA_PREDEFINIDA = "1234";
export const MINUTOS_PREDEFINIDOS = 15;
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 5 * 60_000;
const ESPERA_FALHA_MS = 1500;

interface DadosSudo {
  versao: 1;
  sal: string;
  hash: string;
  predefinida: boolean;
  falhas: number;
  bloqueadoAte: number;
  sessaoAte: number;
}

/** A password só serve de degrau contra o uso casual (a tranca a sério é o Windows), mas guarda-se como deve ser. */
function calcularHash(senha: string, sal: Buffer): Buffer {
  return scryptSync(senha.normalize("NFKC"), sal, 32, { N: 2 ** 14, r: 8, p: 1 });
}

function novoEstado(senha: string, predefinida: boolean): DadosSudo {
  const sal = randomBytes(16);
  return { versao: 1, sal: sal.toString("base64"), hash: calcularHash(senha, sal).toString("base64"), predefinida, falhas: 0, bloqueadoAte: 0, sessaoAte: 0 };
}

export interface OpcoesSudo {
  agora?: () => number;
  esperar?: (ms: number) => void;
}

/** A sessão `sudo`: vale para todo o PC (um agente de IA corre cada comando num terminal novo), guardada no cofre da raiz. */
export class Sudo {
  cofre: Cofre;
  agora: () => number;
  esperar: (ms: number) => void;

  constructor(cofre: Cofre, opcoes: OpcoesSudo = {}) {
    this.cofre = cofre;
    this.agora = opcoes.agora ?? Date.now;
    this.esperar = opcoes.esperar ?? esperar;
  }

  private ler(): DadosSudo {
    return this.cofre.lerJson<DadosSudo>(FICHEIRO) ?? novoEstado(SENHA_PREDEFINIDA, true);
  }

  private mutar<T>(fn: (d: DadosSudo) => T): T {
    return comBloqueio(
      this.cofre.dir,
      () => {
        const d = this.ler();
        const r = fn(d);
        this.cofre.escreverJson(FICHEIRO, d);
        return r;
      },
      5000,
      "sudo.lock",
    );
  }

  sessaoAberta(): boolean {
    return this.ler().sessaoAte > this.agora();
  }

  predefinida(): boolean {
    return this.ler().predefinida;
  }

  entrar(senha: string, minutos = MINUTOS_PREDEFINIDOS): void {
    const r = this.mutar((d) => {
      const agora = this.agora();
      if (d.bloqueadoAte > agora) return { tipo: "bloqueado" as const, restam: d.bloqueadoAte - agora };
      const certa = timingSafeEqual(calcularHash(senha, Buffer.from(d.sal, "base64")), Buffer.from(d.hash, "base64"));
      if (certa) {
        d.falhas = 0;
        d.sessaoAte = agora + minutos * 60_000;
        return { tipo: "ok" as const };
      }
      d.falhas += 1;
      if (d.falhas >= MAX_FALHAS) {
        d.falhas = 0;
        d.bloqueadoAte = agora + BLOQUEIO_MS;
      }
      return { tipo: "senha" as const };
    });
    if (r.tipo === "bloqueado") {
      throw new ErroKeyring("bloqueado", `Demasiadas tentativas falhadas. Tente daqui a ${Math.ceil(r.restam / 60_000)} minuto(s).`);
    }
    if (r.tipo === "senha") {
      this.esperar(ESPERA_FALHA_MS);
      throw new ErroKeyring("senha", "Password errada.");
    }
  }

  sair(): void {
    this.mutar((d) => {
      d.sessaoAte = 0;
    });
  }

  /** Para os comandos privilegiados: sem sessão aberta, diz o que fazer. */
  exigir(): void {
    if (!this.sessaoAberta()) {
      throw new ErroKeyring("sudo", "Precisa de abrir a sessão: corra `keyring sudo` (a password predefinida é 1234) e repita o comando.");
    }
  }

  mudarSenha(antiga: string, nova: string): void {
    if (nova.length < 4) throw new ErroKeyring("senha-curta", "A password nova tem de ter pelo menos 4 caracteres.");
    const r = this.mutar((d) => {
      const certa = timingSafeEqual(calcularHash(antiga, Buffer.from(d.sal, "base64")), Buffer.from(d.hash, "base64"));
      if (!certa) return false;
      Object.assign(d, novoEstado(nova, false));
      return true;
    });
    if (!r) {
      this.esperar(ESPERA_FALHA_MS);
      throw new ErroKeyring("senha", "A password antiga está errada.");
    }
  }
}
