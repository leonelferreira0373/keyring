#!/usr/bin/env node
import { abrirTemporario } from "./abrir-ficheiro.ts";
import { copiarTemporario } from "./area-transferencia.ts";
import { executar, type Ambiente } from "./comandos.ts";
import { ErroKeyring } from "./erro.ts";
import { limparResiduos } from "./residuos.ts";
import { TrancaWindows } from "./tranca.ts";
import { esperar, raizPorOmissao } from "./util.ts";

async function lerStdinTudo(): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const p of process.stdin) partes.push(Buffer.isBuffer(p) ? p : Buffer.from(p));
  return Buffer.concat(partes);
}

/** Pede um segredo sem o mostrar (terminal), ou lê uma linha da entrada (um pipe, como num agente de IA). */
function lerOculto(pergunta: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      let tampao = "";
      entrada.setEncoding("utf8");
      const aoDados = (d: string) => {
        tampao += d;
        const i = tampao.indexOf("\n");
        if (i >= 0) {
          entrada.off("data", aoDados);
          entrada.pause();
          resolver(tampao.slice(0, i).replace(/\r$/, ""));
        }
      };
      entrada.on("data", aoDados);
      entrada.on("end", () => resolver(tampao.replace(/\r?\n$/, "")));
      return;
    }
    process.stderr.write(pergunta);
    let digitado = "";
    const tty = entrada as unknown as { setRawMode(modo: boolean): void };
    const fim = () => {
      entrada.off("data", aoTecla);
      tty.setRawMode(false);
      entrada.pause();
      process.stderr.write("\n");
    };
    const aoTecla = (c: string) => {
      for (const ch of c) {
        if (ch === "\r" || ch === "\n") {
          fim();
          resolver(digitado);
          return;
        }
        if (ch === "\u0003") {
          fim();
          rejeitar(new ErroKeyring("cancelado", "Cancelado."));
          return;
        }
        digitado = ch === "\u007f" || ch === "\b" ? digitado.slice(0, -1) : digitado + ch;
      }
    };
    tty.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8");
    entrada.on("data", aoTecla);
  });
}

const ambiente: Ambiente = {
  raiz: raizPorOmissao(),
  tranca: new TrancaWindows(),
  out: process.stdout,
  err: process.stderr,
  saidaEhTerminal: Boolean(process.stdout.isTTY),
  env: process.env,
  agora: () => Date.now(),
  esperar,
  lerStdinTudo,
  lerOculto,
  escreverBinario: (dados) => void process.stdout.write(dados),
  copiar: copiarTemporario,
  abrirTemporario: (nome, dados) => void abrirTemporario(nome, dados),
};

limparResiduos(); // ficheiros com segredos que um processo morto deixou no temporário
process.exitCode = await executar(process.argv.slice(2), ambiente);
