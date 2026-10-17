import { existsSync, readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Cofre } from "./cofre.ts";
import { cifrar, decifrar, novaChave } from "./cripto.ts";
import { ErroKeyring } from "./erro.ts";
import {
  ESTADOS, MAX_ANTERIORES, TIPOS, normalizar, validarNomeEnv, validarNomeGaveta, validarNomeItem,
  type DadosGaveta, type DadosRaiz, type Estado, type Item, type Projecto, type TipoItem,
} from "./modelo.ts";
import type { Tranca } from "./tranca.ts";
import { comBloqueio, escreverAtomico, hoje, pastaPrivada } from "./util.ts";

const FICHEIRO_RAIZ = "raiz.json.enc";
const FICHEIRO_GAVETA = "gaveta.json.enc";

export interface EntradaItem {
  nome: string;
  tipo: TipoItem;
  conteudo: Buffer;
  env?: string;
  nota?: string;
  estado?: Estado;
  verificadoEm?: string;
  etiquetas?: string[];
  nomeOriginal?: string;
}

/** Uma gaveta aberta: o índice (nome, ficha, itens) e os conteúdos cifrados. */
export class Gaveta {
  numero: number;
  cofre: Cofre;
  dados: DadosGaveta;

  constructor(cofre: Cofre, dados: DadosGaveta) {
    this.cofre = cofre;
    this.dados = dados;
    this.numero = dados.numero;
  }

  get nome(): string {
    return this.dados.nome;
  }

  recarregar(): void {
    const actual = this.cofre.lerJson<DadosGaveta>(FICHEIRO_GAVETA);
    if (actual) this.dados = actual;
  }

  /** Lê o estado actual do disco DENTRO do lock, aplica a mudança e grava: dois processos nunca se pisam. */
  private mutar<T>(fn: (d: DadosGaveta) => T): T {
    return comBloqueio(this.cofre.dir, () => {
      const actual = this.cofre.lerJson<DadosGaveta>(FICHEIRO_GAVETA);
      if (!actual) throw new ErroKeyring("falta", `A gaveta ${this.numero} perdeu o índice.`);
      this.dados = actual;
      const resultado = fn(this.dados);
      this.cofre.escreverJson(FICHEIRO_GAVETA, this.dados);
      return resultado;
    });
  }

  item(nome: string): Item | undefined {
    return this.dados.itens.find((i) => i.nome === nome);
  }

  itemOuErro(nome: string): Item {
    const i = this.item(nome);
    if (!i) throw new ErroKeyring("item", `A gaveta ${this.numero} (${this.nome}) não tem o item «${nome}». Veja \`keyring sudo ${this.numero} ls\`.`);
    return i;
  }

  guardarItem(e: EntradaItem): Item {
    validarNomeItem(e.nome);
    if (e.env !== undefined) validarNomeEnv(e.env);
    if (!(TIPOS as readonly string[]).includes(e.tipo)) throw new ErroKeyring("tipo", `Tipo de item desconhecido «${e.tipo}».`);
    if (e.estado !== undefined && !(ESTADOS as readonly string[]).includes(e.estado)) throw new ErroKeyring("estado", `Estado desconhecido «${e.estado}».`);
    const blob = randomUUID();
    this.cofre.escreverBlob(blob, e.conteudo);
    let descartados: string[] = [];
    let item: Item;
    try {
      item = this.mutar((d) => {
        let it = d.itens.find((i) => i.nome === e.nome);
        if (it && it.tipo !== e.tipo) {
          throw new ErroKeyring("tipo", `O item «${e.nome}» já existe como ${it.tipo}; o tipo não muda (remova-o primeiro).`);
        }
        if (!it) {
          it = { nome: e.nome, tipo: e.tipo, estado: "ok", etiquetas: [], versoes: [] };
          d.itens.push(it);
        }
        it.versoes.unshift({ blob, em: new Date().toISOString() });
        descartados = it.versoes.splice(MAX_ANTERIORES + 1).map((v) => v.blob);
        if (e.env !== undefined) it.env = e.env;
        if (e.nota !== undefined) it.nota = e.nota;
        if (e.estado !== undefined) it.estado = e.estado;
        if (e.verificadoEm !== undefined) it.verificadoEm = e.verificadoEm;
        if (e.etiquetas) it.etiquetas = e.etiquetas;
        if (e.tipo === "ficheiro") it.ficheiro = { nomeOriginal: e.nomeOriginal ?? e.nome, tamanho: e.conteudo.length };
        return structuredClone(it);
      });
    } catch (erro) {
      this.cofre.apagarBlob(blob); // o item foi recusado: não fica um ficheiro órfão
      throw erro;
    }
    for (const b of descartados) this.cofre.apagarBlob(b);
    return item;
  }

  /** O conteúdo da versão `versao` (0 = a actual). */
  lerItem(nome: string, versao = 0): Buffer {
    const it = this.itemOuErro(nome);
    const v = it.versoes[versao];
    if (!v) throw new ErroKeyring("versao", `O item «${nome}» só tem ${it.versoes.length} versão(ões).`);
    return this.cofre.lerBlob(v.blob);
  }

  definirEstado(nome: string, estado: Estado, verificadoEm?: string): void {
    if (!(ESTADOS as readonly string[]).includes(estado)) throw new ErroKeyring("estado", `Estado desconhecido «${estado}». Use ok, rodar ou revogado.`);
    this.itemOuErro(nome);
    this.mutar((d) => {
      const it = d.itens.find((i) => i.nome === nome);
      if (!it) throw new ErroKeyring("item", `O item «${nome}» desapareceu.`);
      it.estado = estado;
      if (estado === "ok") it.verificadoEm = verificadoEm ?? hoje();
    });
  }

  removerItem(nome: string): void {
    this.itemOuErro(nome);
    const blobs = this.mutar((d) => {
      const i = d.itens.findIndex((x) => x.nome === nome);
      if (i < 0) return [] as string[];
      const [it] = d.itens.splice(i, 1);
      return it.versoes.map((v) => v.blob);
    });
    for (const b of blobs) this.cofre.apagarBlob(b);
  }

  definirFicha(texto: string): void {
    this.mutar((d) => {
      d.ficha = texto;
    });
  }

  /** Para a importação: repõe um item com todas as suas versões (a primeira é a actual). */
  restaurarItem(item: Omit<Item, "versoes">, versoes: { em: string; dados: Buffer }[]): void {
    validarNomeItem(item.nome);
    if (item.env !== undefined) validarNomeEnv(item.env);
    const novas = versoes.map((v) => {
      const blob = randomUUID();
      this.cofre.escreverBlob(blob, v.dados);
      return { blob, em: v.em };
    });
    this.mutar((d) => {
      if (d.itens.some((i) => i.nome === item.nome)) throw new ErroKeyring("duplicada", `O item «${item.nome}» já existe nesta gaveta.`);
      d.itens.push({ ...item, versoes: novas });
    });
  }
}

export interface ItemResolvido {
  gaveta: Gaveta;
  item: Item;
}

/** Os números das pastas de gaveta que existem no disco (abrissem ou não). */
function numerosEmDisco(raiz: string): number[] {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => Number(d.name))
    .sort((a, b) => a - b);
}

export interface Avaria {
  numero: number;
  mensagem: string;
}

/** Todas as gavetas: a chave-raiz (trancada pelo Windows), os números e (Tarefa 7) os projectos. */
export class Gavetas {
  raiz: string;
  tranca: Tranca;
  cofreRaiz: Cofre;
  /** As gavetas que a última chamada a `todas()` não conseguiu abrir (e porquê). */
  avarias: Avaria[] = [];

  constructor(raiz: string, tranca: Tranca, cofreRaiz: Cofre) {
    this.raiz = raiz;
    this.tranca = tranca;
    this.cofreRaiz = cofreRaiz;
  }

  /** Abre (ou cria, à primeira vez) a pasta dos dados. Faz UMA chamada à tranca. */
  static abrir(raiz: string, tranca: Tranca): Gavetas {
    pastaPrivada(raiz);
    const dirRaiz = join(raiz, "_raiz");
    pastaPrivada(dirRaiz);
    const ficheiroChave = join(dirRaiz, "chave.dpapi");
    let chave: Buffer;
    if (existsSync(ficheiroChave)) {
      chave = tranca.destrancar(readFileSync(ficheiroChave));
    } else {
      chave = novaChave();
      escreverAtomico(ficheiroChave, tranca.trancar(chave));
    }
    const cofreRaiz = new Cofre(dirRaiz, chave);
    cofreRaiz.limparTemporarios();
    if (!cofreRaiz.lerJson<DadosRaiz>(FICHEIRO_RAIZ)) {
      // à primeira vez não há gavetas; se o ficheiro se perdeu depois, os números que já existem no disco não se reutilizam
      const inicial: DadosRaiz = { versao: 1, proximoNumero: Math.max(0, ...numerosEmDisco(raiz)) + 1, projectos: [] };
      cofreRaiz.escreverJson(FICHEIRO_RAIZ, inicial);
    }
    return new Gavetas(raiz, tranca, cofreRaiz);
  }

  dadosRaiz(): DadosRaiz {
    const d = this.cofreRaiz.lerJson<DadosRaiz>(FICHEIRO_RAIZ);
    if (!d) throw new ErroKeyring("falta", "A pasta dos dados perdeu o ficheiro de raiz.");
    return d;
  }

  protected mutarRaiz<T>(fn: (d: DadosRaiz) => T): T {
    return comBloqueio(
      this.cofreRaiz.dir,
      () => {
        const d = this.dadosRaiz();
        const r = fn(d);
        this.cofreRaiz.escreverJson(FICHEIRO_RAIZ, d);
        return r;
      },
      5000,
      "raiz.lock",
    );
  }

  numeros(): number[] {
    return numerosEmDisco(this.raiz);
  }

  abrirGaveta(numero: number): Gaveta {
    const dir = join(this.raiz, String(numero));
    if (!existsSync(join(dir, "chave.enc"))) throw new ErroKeyring("gaveta", `Não existe a gaveta ${numero}. Veja \`keyring ls\`.`);
    const chave = decifrar(this.cofreRaiz.chave, readFileSync(join(dir, "chave.enc")), `chave-gaveta:${numero}`);
    const cofre = new Cofre(dir, chave);
    cofre.limparTemporarios();
    const dados = cofre.lerJson<DadosGaveta>(FICHEIRO_GAVETA);
    if (!dados) throw new ErroKeyring("falta", `A gaveta ${numero} perdeu o índice.`);
    return new Gaveta(cofre, dados);
  }

  /** Abre todas as que abrem; uma que não abre (ficheiro em falta, adulterada) fica em `avarias` e não impede as outras. */
  todas(): Gaveta[] {
    this.avarias = [];
    const abertas: Gaveta[] = [];
    for (const n of this.numeros()) {
      try {
        abertas.push(this.abrirGaveta(n));
      } catch (e) {
        this.avarias.push({ numero: n, mensagem: (e as Error).message });
      }
    }
    return abertas;
  }

  /** Por número («3») ou por nome («Acme Corp»), sem maiúsculas nem acentos. */
  resolver(ref: string): Gaveta {
    const r = ref.trim();
    if (/^\d+$/.test(r)) return this.abrirGaveta(Number(r));
    const alvo = normalizar(r);
    const g = this.todas().find((x) => normalizar(x.nome) === alvo);
    if (!g) {
      const nao = this.avarias.length > 0 ? ` (há gavetas que não abrem: ${this.avarias.map((a) => a.numero).join(", ")}; use o número)` : "";
      throw new ErroKeyring("gaveta", `Não existe a gaveta «${ref}»${nao}. Veja \`keyring ls\`.`);
    }
    return g;
  }

  /** Cria uma gaveta com o próximo número livre (ou com `numero`, se estiver livre). Os números nunca se reutilizam. */
  criar(nome: string, entidade: string, ficha = "", numero?: number): Gaveta {
    validarNomeGaveta(nome);
    const alvo = normalizar(nome);
    if (this.todas().some((g) => normalizar(g.nome) === alvo)) throw new ErroKeyring("duplicada", `Já existe uma gaveta chamada «${nome}».`);
    const n = this.mutarRaiz((d) => {
      let escolhido: number;
      if (numero !== undefined) {
        if (!Number.isInteger(numero) || numero < 1 || this.numeros().includes(numero)) {
          throw new ErroKeyring("numero", `O número ${numero} não está livre (ou é inválido).`);
        }
        escolhido = numero;
      } else {
        // nunca um número cuja pasta já existe, mesmo que a raiz diga outra coisa: sobrepor-lhe a chave perdia os dados
        escolhido = Math.max(d.proximoNumero, ...this.numeros().map((x) => x + 1));
      }
      d.proximoNumero = Math.max(d.proximoNumero, escolhido + 1);
      return escolhido;
    });
    const dir = join(this.raiz, String(n));
    pastaPrivada(dir);
    const chave = novaChave();
    escreverAtomico(join(dir, "chave.enc"), cifrar(this.cofreRaiz.chave, chave, `chave-gaveta:${n}`));
    const cofre = new Cofre(dir, chave);
    const dados: DadosGaveta = { versao: 1, numero: n, nome: nome.trim(), entidade, ficha, criadaEm: new Date().toISOString(), itens: [] };
    cofre.escreverJson(FICHEIRO_GAVETA, dados);
    return new Gaveta(cofre, dados);
  }

  projectos(): Projecto[] {
    return this.dadosRaiz().projectos;
  }

  projecto(nome: string): Projecto {
    const alvo = normalizar(nome);
    const p = this.projectos().find((x) => normalizar(x.nome) === alvo);
    if (!p) throw new ErroKeyring("projecto", `Não existe o projecto «${nome}». Veja \`keyring sudo projecto\`.`);
    return p;
  }

  criarProjecto(nome: string, descricao: string): void {
    validarNomeGaveta(nome, "projecto");
    this.mutarRaiz((d) => {
      if (d.projectos.some((p) => normalizar(p.nome) === normalizar(nome))) throw new ErroKeyring("duplicada", `Já existe o projecto «${nome}».`);
      d.projectos.push({ nome: nome.trim(), descricao, itens: [] });
    });
  }

  /** Aponta o projecto a um item (de QUALQUER gaveta). Guarda só a referência, nunca o segredo. */
  adicionarAoProjecto(nome: string, gaveta: number, item: string): void {
    const alvo = this.projecto(nome).nome;
    this.abrirGaveta(gaveta).itemOuErro(item);
    this.mutarRaiz((d) => {
      const p = d.projectos.find((x) => x.nome === alvo);
      if (!p) throw new ErroKeyring("projecto", `Não existe o projecto «${nome}».`);
      if (!p.itens.some((r) => r.gaveta === gaveta && r.item === item)) p.itens.push({ gaveta, item });
    });
  }

  /** Os itens que o projecto precisa, já abertos. Um item que entretanto desapareceu dá erro claro. */
  resolverProjecto(nome: string): ItemResolvido[] {
    return this.projecto(nome).itens.map((r) => {
      const g = this.abrirGaveta(r.gaveta);
      return { gaveta: g, item: g.itemOuErro(r.item) };
    });
  }
}
