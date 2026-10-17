import { randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { cifrar, decifrar, derivarChave } from "./cripto.ts";
import { ErroKeyring } from "./erro.ts";
import type { Gaveta, Gavetas } from "./gavetas.ts";
import type { Item } from "./modelo.ts";

const MAGIA = Buffer.from("KEYRING1\n", "utf8");
const TAMANHO_SAL = 16;
const AAD = "keyring-export-v1";

interface ItemExportado extends Omit<Item, "versoes"> {
  versoes: { em: string; dados: string }[];
}
interface Exportado {
  versao: 1;
  numero: number;
  nome: string;
  entidade: string;
  ficha: string;
  criadaEm: string;
  itens: ItemExportado[];
}

/** Um só ficheiro com a gaveta inteira (histórico incluído), cifrado por uma chave derivada da frase-passe. Não tem nada em claro. */
export function exportarGaveta(g: Gaveta, frase: string): Buffer {
  if (frase.length < 8) throw new ErroKeyring("frase", "A frase-passe tem de ter pelo menos 8 caracteres.");
  const conteudo: Exportado = {
    versao: 1,
    numero: g.numero,
    nome: g.nome,
    entidade: g.dados.entidade,
    ficha: g.dados.ficha,
    criadaEm: g.dados.criadaEm,
    itens: g.dados.itens.map((i) => ({ ...i, versoes: i.versoes.map((v) => ({ em: v.em, dados: g.cofre.lerBlob(v.blob).toString("base64") })) })),
  };
  const sal = randomBytes(TAMANHO_SAL);
  const chave = derivarChave(frase, sal);
  return Buffer.concat([MAGIA, sal, cifrar(chave, gzipSync(Buffer.from(JSON.stringify(conteudo), "utf8")), AAD)]);
}

/** Restaura uma gaveta exportada. Usa o número original, a não ser que se diga outro (ou que esteja ocupado: dá erro `numero`). */
export function importarGaveta(gs: Gavetas, ficheiro: Buffer, frase: string, numero?: number): Gaveta {
  if (!ficheiro.subarray(0, MAGIA.length).equals(MAGIA)) throw new ErroKeyring("formato", "Isto não é uma cópia de recuperação do keyring.");
  const sal = ficheiro.subarray(MAGIA.length, MAGIA.length + TAMANHO_SAL);
  let claro: Buffer;
  try {
    claro = gunzipSync(decifrar(derivarChave(frase, sal), ficheiro.subarray(MAGIA.length + TAMANHO_SAL), AAD));
  } catch (e) {
    if (e instanceof ErroKeyring && e.codigo === "adulterado") throw new ErroKeyring("frase", "Frase-passe errada ou ficheiro alterado.");
    throw new ErroKeyring("formato", "A cópia de recuperação está truncada ou estragada.");
  }
  const d = JSON.parse(claro.toString("utf8")) as Exportado;
  const g = gs.criar(d.nome, d.entidade, d.ficha, numero ?? d.numero);
  for (const { versoes, ...item } of d.itens) {
    g.restaurarItem(item, versoes.map((v) => ({ em: v.em, dados: Buffer.from(v.dados, "base64") })));
  }
  return g;
}
