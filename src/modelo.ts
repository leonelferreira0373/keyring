import { ErroKeyring } from "./erro.ts";

export const ESTADOS = ["ok", "rodar", "revogado"] as const;
export type Estado = (typeof ESTADOS)[number];
export const TIPOS = ["valor", "nota", "ficheiro"] as const;
export type TipoItem = (typeof TIPOS)[number];
/** Guarda-se a versão actual e as 5 anteriores. */
export const MAX_ANTERIORES = 5;

export interface Versao {
  blob: string;
  em: string;
}
export interface Item {
  nome: string;
  tipo: TipoItem;
  env?: string;
  nota?: string;
  estado: Estado;
  verificadoEm?: string;
  etiquetas: string[];
  ficheiro?: { nomeOriginal: string; tamanho: number };
  /** [0] é a actual. */
  versoes: Versao[];
}
export interface DadosGaveta {
  versao: 1;
  numero: number;
  nome: string;
  entidade: string;
  ficha: string;
  criadaEm: string;
  itens: Item[];
}
export interface RefItem {
  gaveta: number;
  item: string;
}
export interface Projecto {
  nome: string;
  descricao: string;
  itens: RefItem[];
}
export interface DadosRaiz {
  versao: 1;
  proximoNumero: number;
  projectos: Projecto[];
}

/** Palavras de comando: não podem ser nome de gaveta nem de projecto. */
export const RESERVADAS = [
  "ls", "rec", "sudo", "por", "correr", "copiar", "tirar", "abrir", "estado", "remover", "criar",
  "projecto", "exportar", "importar", "passwd", "ficha", "ajuda-ia", "txt", "pdf",
];

const NOME_GAVETA = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u;
const NOME_ITEM = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const NOME_ENV = /^[A-Z_][A-Z0-9_]{0,63}$/;

/** Sem acentos, sem maiúsculas, sem espaços nas pontas: para comparar nomes. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Tira as plicas, aspas e acentos agudos/tipográficos que o terminal deixa à volta de um nome. */
export function limparPlicas(texto: string): string {
  return texto.trim().replace(/^['"´`‘’“”]+|['"´`‘’“”]+$/g, "").trim();
}

export function validarNomeGaveta(nome: string, o = "gaveta"): void {
  const n = nome.trim();
  if (!NOME_GAVETA.test(n) || /^\d+$/.test(n) || RESERVADAS.includes(normalizar(n))) {
    throw new ErroKeyring(
      "nome",
      `Nome de ${o} inválido «${nome}»: use letras, números, espaços ou hífen (máximo 40), não só números e não uma palavra de comando.`,
    );
  }
}

export function validarNomeItem(nome: string): void {
  if (!NOME_ITEM.test(nome)) {
    throw new ErroKeyring(
      "nome",
      `Nome de item inválido «${nome}»: use minúsculas, números, ponto, hífen ou sublinhado, começando por letra ou número (ex.: cloudflare.api_token).`,
    );
  }
}

export function validarNomeEnv(nome: string): void {
  if (!NOME_ENV.test(nome)) {
    throw new ErroKeyring("nome", `Nome de variável inválido «${nome}»: use MAIÚSCULAS, números e sublinhado (ex.: CLOUDFLARE_API_TOKEN).`);
  }
}

const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Um nome de ficheiro que se pode escrever com segurança numa pasta (sem caminhos, sem caracteres proibidos). */
export function nomeSeguro(nome: string): string {
  let n = nome.replace(/[\\/]+/g, "/").split("/").pop() ?? "";
  n = n.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim();
  if (n === "" || n === "." || n === "..") n = "ficheiro";
  if (RESERVADOS_WINDOWS.test(n)) n = `_${n}`;
  return n.slice(0, 120);
}
