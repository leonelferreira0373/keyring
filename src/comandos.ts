import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AJUDA_IA } from "./ajuda-ia.ts";
import { correr } from "./correr.ts";
import { ErroKeyring } from "./erro.ts";
import { exportarGaveta, importarGaveta } from "./exportar.ts";
import { Gavetas, type Gaveta, type ItemResolvido } from "./gavetas.ts";
import { construirIndice, indiceTexto } from "./indice.ts";
import { ESTADOS, TIPOS, limparPlicas, nomeSeguro, normalizar, type Estado, type TipoItem } from "./modelo.ts";
import { pdfDeTexto } from "./pdf.ts";
import { relatorioTexto } from "./relatorio.ts";
import { MINUTOS_PREDEFINIDOS, Sudo } from "./sudo.ts";
import type { Tranca } from "./tranca.ts";
import { hoje } from "./util.ts";

export interface Saida {
  /** Texto, ou bytes tal como vieram (a saída de um comando de `correr` não é necessariamente UTF-8). */
  write(texto: string | Buffer): unknown;
}

/** Tudo o que toca no mundo (terminal, relógio, área de transferência) entra por aqui: o interpretador testa-se sem Windows. */
export interface Ambiente {
  raiz: string;
  tranca: Tranca;
  out: Saida;
  err: Saida;
  saidaEhTerminal: boolean;
  env: Record<string, string | undefined>;
  agora(): number;
  esperar(ms: number): void;
  lerStdinTudo(): Promise<Buffer>;
  lerOculto(pergunta: string): Promise<string>;
  escreverBinario(dados: Buffer): void;
  copiar(texto: string, segundos: number): void;
  abrirTemporario(nomeOriginal: string, dados: Buffer): void;
}

const ACOES = ["ls", "rec", "por", "correr", "copiar", "tirar", "abrir", "estado", "remover", "criar", "projecto", "ficha", "exportar", "importar"];
const SEGUNDOS_AREA_TRANSFERENCIA = 30;

const OPCOES = {
  mostrar: { type: "boolean" },
  stdin: { type: "boolean" },
  env: { type: "string" },
  descricao: { type: "string" },
  tipo: { type: "string" },
  estado: { type: "string" },
  entidade: { type: "string" },
  "ficha-de": { type: "string" },
  de: { type: "string" },
  minutos: { type: "string" },
  projecto: { type: "string" },
  numero: { type: "string" },
  k: { type: "boolean", short: "k" },
} as const;

const ABRE = /^['"´`‘“]/;
const FECHA = /['"´`’”]$/;

/** O cmd.exe não trata as plicas como aspas: `'Acme Corp'` chega em dois pedaços. Junta-os outra vez. */
export function juntarPlicas(tokens: string[]): string[] {
  const saida: string[] = [];
  let acc: string[] | null = null;
  for (const t of tokens) {
    if (acc) {
      acc.push(t);
      if (FECHA.test(t)) {
        saida.push(acc.join(" "));
        acc = null;
      }
      continue;
    }
    if (ABRE.test(t) && !(t.length > 1 && FECHA.test(t))) {
      acc = [t];
      continue;
    }
    saida.push(t);
  }
  if (acc) saida.push(acc.join(" "));
  return saida;
}

function analisar(args: string[]) {
  try {
    const r = parseArgs({ args, options: OPCOES, allowPositionals: true, strict: true });
    return { values: r.values, positionals: juntarPlicas(r.positionals) };
  } catch (e) {
    throw new ErroKeyring("opcao", `Opção desconhecida ou mal usada: ${(e as Error).message.split("\n")[0]}`);
  }
}
type Valores = ReturnType<typeof analisar>["values"];

export async function executar(argv: string[], amb: Ambiente): Promise<number> {
  // o que vem depois do primeiro `--` é o comando de `correr`: um `--json` aí é dele, não nosso
  const corte = argv.indexOf("--");
  const nossos = corte < 0 ? argv : argv.slice(0, corte);
  const json = nossos.includes("--json");
  try {
    return await despachar(argv.filter((a, n) => a !== "--json" || (corte >= 0 && n > corte)), amb, json);
  } catch (e) {
    if (e instanceof ErroKeyring) {
      amb.err.write(json ? `${JSON.stringify({ erro: { codigo: e.codigo, mensagem: e.message } })}\n` : `erro: ${e.message}\n`);
      return 1;
    }
    amb.err.write(`erro inesperado: ${(e as Error).message}\n`);
    return 2;
  }
}

async function despachar(argv: string[], amb: Ambiente, json: boolean): Promise<number> {
  const i = argv.indexOf("--");
  const antes = i < 0 ? argv : argv.slice(0, i);
  const comando = i < 0 ? [] : argv.slice(i + 1);
  const [primeiro, ...resto] = antes;
  if (primeiro === undefined) return indice(amb, json);
  if (primeiro === "ls") return listarGavetas(Gavetas.abrir(amb.raiz, amb.tranca), amb, json);
  if (primeiro === "ajuda-ia") {
    amb.out.write(AJUDA_IA);
    return 0;
  }
  if (primeiro === "sudo") return sudo(resto, comando, amb, json);
  throw new ErroKeyring(
    "comando",
    `Comando desconhecido «${primeiro}». Sem password: \`keyring\` (índice), \`keyring ls\`, \`keyring ajuda-ia\`. O resto começa por sudo: \`keyring sudo <gaveta> ls\`.`,
  );
}

/** Uma gaveta que não abre não pode esconder-se: avisa-se no stderr (o resto continua a funcionar). */
function avisarAvarias(gs: Gavetas, amb: Ambiente): void {
  for (const a of gs.avarias) amb.err.write(`aviso: a gaveta ${a.numero} não abre (${a.mensagem}). As outras funcionam; os dados dela não foram tocados.\n`);
}

function indice(amb: Ambiente, json: boolean): number {
  const gs = Gavetas.abrir(amb.raiz, amb.tranca);
  const ind = construirIndice(gs, hoje());
  avisarAvarias(gs, amb);
  amb.out.write(json ? `${JSON.stringify(ind, null, 2)}\n` : indiceTexto(ind));
  return 0;
}

function listarGavetas(gs: Gavetas, amb: Ambiente, json: boolean): number {
  const abertas = gs.todas();
  avisarAvarias(gs, amb);
  if (abertas.length === 0 && gs.avarias.length > 0) {
    throw new ErroKeyring("gaveta", "Nenhuma gaveta abre. Se mudou de PC ou de utilizador do Windows, use `keyring sudo importar <ficheiro>` com a cópia de recuperação.");
  }
  const lista = abertas.map((g) => ({
    numero: g.numero,
    nome: g.nome,
    entidade: g.dados.entidade,
    itens: g.dados.itens.length,
    rodar: g.dados.itens.filter((i) => i.estado === "rodar").length,
    revogados: g.dados.itens.filter((i) => i.estado === "revogado").length,
  }));
  if (json) {
    amb.out.write(`${JSON.stringify(lista, null, 2)}\n`);
    return 0;
  }
  if (lista.length === 0) {
    amb.out.write("Nenhuma gaveta ainda. Crie a primeira com: keyring sudo criar <nome> --entidade <empresa>\n");
    return 0;
  }
  const w = Math.max(...lista.map((g) => g.nome.length)) + 2;
  amb.out.write(`Gavetas (${lista.length}):\n`);
  for (const g of lista) {
    const extra = `${g.rodar ? ` · ${g.rodar} a rodar` : ""}${g.revogados ? ` · ${g.revogados} revogados` : ""}`;
    amb.out.write(`  ${String(g.numero).padStart(3)}  ${g.nome.padEnd(w)}${g.entidade.padEnd(20)} ${g.itens} itens${extra}\n`);
  }
  return 0;
}

async function sudo(args: string[], comando: string[], amb: Ambiente, json: boolean): Promise<number> {
  const { values, positionals } = analisar(args);
  const gs = Gavetas.abrir(amb.raiz, amb.tranca);
  const s = new Sudo(gs.cofreRaiz, { agora: () => amb.agora(), esperar: (ms) => amb.esperar(ms) });

  if (values.k) {
    s.sair();
    amb.out.write("Sessão sudo fechada.\n");
    return 0;
  }
  if (positionals[0] === "passwd") {
    const antiga = await amb.lerOculto("Password actual: ");
    const nova = await amb.lerOculto("Password nova: ");
    const repetida = await amb.lerOculto("Repita a password nova: ");
    if (nova !== repetida) throw new ErroKeyring("senha", "As duas passwords novas não são iguais.");
    s.mudarSenha(antiga, nova);
    amb.out.write("Password mudada.\n");
    return 0;
  }

  // `keyring sudo` sozinho pede sempre a password (renova a sessão); com mais argumentos usa a sessão em cache
  if (positionals.length === 0 || !s.sessaoAberta()) {
    const minutos = values.minutos === undefined ? MINUTOS_PREDEFINIDOS : Number(values.minutos);
    if (!Number.isFinite(minutos) || minutos < 1 || minutos > 1440) throw new ErroKeyring("minutos", "--minutos tem de ser entre 1 e 1440.");
    // com --stdin a entrada é o valor a guardar: pedir a password à mesma entrada comia-o
    if (values.stdin && positionals.length > 0 && amb.env.KEYRING_SENHA === undefined) {
      throw new ErroKeyring("sudo", "A sessão sudo não está aberta e a entrada está a ser usada para o valor: abra-a primeiro com `echo 1234 | keyring sudo` (ou defina KEYRING_SENHA) e repita.");
    }
    const senha = amb.env.KEYRING_SENHA ?? (await amb.lerOculto("Password do keyring: "));
    s.entrar(senha, minutos);
    if (s.predefinida()) amb.err.write("aviso: a password ainda é a predefinida (1234). Mude-a com `keyring sudo passwd`.\n");
    if (positionals.length === 0) {
      amb.out.write(`Sessão sudo aberta por ${minutos} minuto(s).\n`);
      return 0;
    }
  }

  const idx = positionals.findIndex((p) => ACOES.includes(normalizar(p)));
  const refs = (idx < 0 ? positionals : positionals.slice(0, idx)).map(limparPlicas);
  const acao = idx < 0 ? "ls" : normalizar(positionals[idx]);
  const resto = idx < 0 ? [] : positionals.slice(idx + 1);

  switch (acao) {
    case "ls":
      return refs.length === 0 ? listarGavetas(gs, amb, json) : acaoLs(gs, refs, values, amb, json);
    case "rec":
      return acaoRec(gs, refs, resto, amb);
    case "por":
      return acaoPor(gs, refs, resto, values, amb);
    case "correr":
      return acaoCorrer(gs, refs, values, comando, amb);
    case "copiar":
      return acaoCopiar(gs, refs, resto, amb);
    case "tirar":
      return acaoTirar(gs, refs, resto, amb);
    case "abrir":
      return acaoAbrir(gs, refs, resto, amb);
    case "estado":
      return acaoEstado(gs, refs, resto, amb);
    case "remover":
      return acaoRemover(gs, refs, resto, amb);
    case "ficha":
      return acaoFicha(gs, refs, values, amb);
    case "criar":
      return acaoCriar(gs, resto, values, amb);
    case "projecto":
      return acaoProjecto(gs, resto, values, comando, amb);
    case "exportar":
      return acaoExportar(gs, refs, resto, amb);
    case "importar":
      return acaoImportar(gs, resto, values, amb);
    default:
      throw new ErroKeyring("comando", `Acção desconhecida «${acao}».`);
  }
}

function umaGaveta(gs: Gavetas, refs: string[], acao: string): Gaveta {
  if (refs.length !== 1) throw new ErroKeyring("gaveta", `\`${acao}\` precisa de exactamente uma gaveta: keyring sudo <gaveta> ${acao} …`);
  return gs.resolver(refs[0]);
}

function textoItem(g: Gaveta, nome: string, mostrar: boolean): string {
  const t = g.lerItem(nome).toString("utf8");
  return mostrar ? t : `***(${t.length})`;
}

function acaoLs(gs: Gavetas, refs: string[], values: Valores, amb: Ambiente, json: boolean): number {
  const mostrar = Boolean(values.mostrar) || amb.saidaEhTerminal;
  const gavetas = [...new Map(refs.map((r) => gs.resolver(r)).map((g): [number, Gaveta] => [g.numero, g])).values()];
  if (json) {
    amb.out.write(
      `${JSON.stringify(
        gavetas.map((g) => ({
          numero: g.numero,
          nome: g.nome,
          entidade: g.dados.entidade,
          ficha: g.dados.ficha,
          itens: g.dados.itens.map((i) => ({
            nome: i.nome, tipo: i.tipo, estado: i.estado, env: i.env, nota: i.nota, verificadoEm: i.verificadoEm,
            ...(i.tipo === "valor" ? { valor: textoItem(g, i.nome, mostrar) } : {}),
          })),
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  for (const g of gavetas) {
    amb.out.write(`Gaveta ${g.numero} — ${g.nome} (${g.dados.entidade})\n`);
    if (g.dados.ficha.trim()) amb.out.write(`Ficha:\n${g.dados.ficha.trim().split("\n").map((l) => `  ${l}`).join("\n")}\n`);
    amb.out.write(`Itens (${g.dados.itens.length}):\n`);
    const w = Math.max(10, ...g.dados.itens.map((i) => i.nome.length)) + 2;
    for (const i of g.dados.itens) {
      const partes = [i.nome.padEnd(w), i.tipo.padEnd(9), i.estado.padEnd(9)];
      if (i.env) partes.push(`env=${i.env}`);
      if (i.verificadoEm) partes.push(`verificado=${i.verificadoEm}`);
      if (i.nota) partes.push(`— ${i.nota}`);
      amb.out.write(`  ${partes.join(" ").trimEnd()}\n`);
      if (i.tipo === "valor") amb.out.write(`      valor: ${textoItem(g, i.nome, mostrar)}\n`);
      else if (i.tipo === "ficheiro") amb.out.write(`      ficheiro: ${i.ficheiro?.nomeOriginal} (${i.ficheiro?.tamanho} bytes)\n`);
      else amb.out.write(`      ${g.lerItem(i.nome).toString("utf8").split("\n")[0].slice(0, 100)}\n`);
    }
    amb.out.write("\n");
  }
  return 0;
}

function ehPasta(caminho: string): boolean {
  return /[\\/]$/.test(caminho) || (existsSync(caminho) && statSync(caminho).isDirectory());
}

function acaoRec(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  if (refs.length === 0) throw new ErroKeyring("gaveta", "Diga a(s) gaveta(s): keyring sudo <gaveta> rec pdf <caminho>.");
  let formato: "txt" | "pdf" = "pdf";
  let caminho: string | undefined;
  for (const a of args) {
    const n = normalizar(a);
    if (n === "txt" || n === "pdf") formato = n;
    else caminho = a;
  }
  const gavetas = [...new Map(refs.map((r) => gs.resolver(r)).map((g): [number, Gaveta] => [g.numero, g])).values()];
  const quando = new Date().toISOString().replace("T", " ").slice(0, 16);
  const gerar = (g: Gaveta): Buffer => {
    const t = relatorioTexto(g, quando);
    return formato === "txt" ? Buffer.from(t, "utf8") : pdfDeTexto(t);
  };
  const escrever = (ficheiro: string, dados: Buffer): void => {
    mkdirSync(dirname(resolve(ficheiro)), { recursive: true });
    writeFileSync(ficheiro, dados);
    amb.err.write(`escrevi: ${ficheiro}\n`);
  };

  if (gavetas.length === 1 && !(caminho && ehPasta(caminho))) {
    const dados = gerar(gavetas[0]);
    if (caminho) {
      escrever(caminho, dados);
    } else if (formato === "txt") {
      amb.out.write(dados.toString("utf8"));
    } else {
      if (amb.saidaEhTerminal) {
        throw new ErroKeyring("terminal", "O PDF é binário: diga o caminho (`rec pdf C:\\pasta\\acme.pdf`) ou redirecione a saída com >.");
      }
      amb.escreverBinario(dados);
    }
  } else {
    if (!caminho) throw new ErroKeyring("caminho", "Para várias gavetas diga a pasta: keyring sudo 'g1' 'g2' rec pdf C:\\pasta");
    for (const g of gavetas) escrever(join(caminho, `${nomeSeguro(g.nome)}.${formato}`), gerar(g));
  }
  amb.err.write("aviso: o resultado tem segredos em texto simples; apague-o quando acabar.\n");
  return 0;
}

async function acaoPor(gs: Gavetas, refs: string[], args: string[], values: Valores, amb: Ambiente): Promise<number> {
  const g = umaGaveta(gs, refs, "por");
  const [nome, origem] = args;
  if (!nome) {
    throw new ErroKeyring("uso", "Uso: keyring sudo <gaveta> por <nome> [ficheiro] [--env VAR] [--descricao texto] [--tipo valor|nota|ficheiro] [--stdin]");
  }
  const tipo = (values.tipo ?? (origem ? "ficheiro" : "valor")) as TipoItem;
  if (!(TIPOS as readonly string[]).includes(tipo)) throw new ErroKeyring("tipo", `Tipo «${tipo}» desconhecido. Use valor, nota ou ficheiro.`);
  let conteudo: Buffer;
  let nomeOriginal: string | undefined;
  if (origem) {
    conteudo = readFileSync(origem);
    nomeOriginal = basename(origem);
  } else if (values.stdin) {
    conteudo = await amb.lerStdinTudo();
    if (tipo === "valor") conteudo = Buffer.from(conteudo.toString("utf8").replace(/\r?\n$/, ""), "utf8");
  } else if (tipo === "valor") {
    conteudo = Buffer.from(await amb.lerOculto(`Valor de ${nome}: `), "utf8");
  } else {
    throw new ErroKeyring("uso", "Para uma nota ou um ficheiro diga o caminho do ficheiro ou use --stdin.");
  }
  const estado = values.estado as Estado | undefined;
  const it = g.guardarItem({ nome, tipo, conteudo, env: values.env, nota: values.descricao, estado, nomeOriginal });
  amb.out.write(`Guardado na gaveta ${g.numero} (${g.nome}): ${nome} (${tipo}, ${conteudo.length} bytes, ${it.versoes.length} versão(ões)).\n`);
  if (tipo === "valor" && conteudo.length < 6) amb.err.write("aviso: valores com menos de 6 caracteres não são censurados na saída do `correr`.\n");
  return 0;
}

function acaoCorrer(gs: Gavetas, refs: string[], values: Valores, comando: string[], amb: Ambiente): Promise<number> {
  let itens: ItemResolvido[];
  if (values.projecto) {
    itens = gs.resolverProjecto(values.projecto);
  } else {
    if (refs.length === 0) throw new ErroKeyring("gaveta", "Diga a gaveta (ou --projecto nome): keyring sudo <gaveta> correr -- <comando>");
    itens = refs.flatMap((r) => {
      const g = gs.resolver(r);
      return g.dados.itens.filter((i) => i.env).map((item) => ({ gaveta: g, item }));
    });
  }
  return correr(itens, comando, { out: amb.out, err: amb.err });
}

function acaoCopiar(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "copiar");
  const it = g.itemOuErro(args[0] ?? "");
  if (it.tipo !== "valor") throw new ErroKeyring("tipo", `«${it.nome}» é ${it.tipo}; \`copiar\` só serve para valores. Use \`tirar\` ou \`abrir\`.`);
  amb.copiar(g.lerItem(it.nome).toString("utf8"), SEGUNDOS_AREA_TRANSFERENCIA);
  amb.out.write(`Copiado. A área de transferência limpa-se em ${SEGUNDOS_AREA_TRANSFERENCIA} s.\n`);
  return 0;
}

function acaoTirar(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "tirar");
  const [nome, destino] = args;
  if (!nome || !destino) throw new ErroKeyring("uso", "Uso: keyring sudo <gaveta> tirar <item> <destino>");
  const it = g.itemOuErro(nome);
  if (it.tipo === "valor") throw new ErroKeyring("tipo", `«${nome}» é um valor secreto e não se extrai para ficheiro. Use \`copiar\`, ou \`correr\` para o usar.`);
  const ficheiro = ehPasta(destino) ? join(destino, nomeSeguro(it.ficheiro?.nomeOriginal ?? `${it.nome}.md`)) : destino;
  mkdirSync(dirname(resolve(ficheiro)), { recursive: true });
  writeFileSync(ficheiro, g.lerItem(nome));
  amb.out.write(`Escrevi ${ficheiro}\n`);
  return 0;
}

function acaoAbrir(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "abrir");
  const it = g.itemOuErro(args[0] ?? "");
  if (it.tipo === "valor") throw new ErroKeyring("tipo", `«${it.nome}» é um valor secreto: use \`copiar\`.`);
  amb.abrirTemporario(it.ficheiro?.nomeOriginal ?? `${it.nome}.md`, g.lerItem(it.nome));
  amb.out.write("Aberto numa pasta temporária que se apaga sozinha.\n");
  return 0;
}

function acaoEstado(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "estado");
  const [nome, estado] = args;
  if (!nome || !estado || !(ESTADOS as readonly string[]).includes(estado)) {
    throw new ErroKeyring("uso", "Uso: keyring sudo <gaveta> estado <item> ok|rodar|revogado");
  }
  g.definirEstado(nome, estado as Estado);
  amb.out.write(`${nome}: ${estado}\n`);
  return 0;
}

function acaoRemover(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "remover");
  if (!args[0]) throw new ErroKeyring("uso", "Uso: keyring sudo <gaveta> remover <item>");
  g.removerItem(args[0]);
  amb.out.write(`Removido: ${args[0]}\n`);
  return 0;
}

function acaoFicha(gs: Gavetas, refs: string[], values: Valores, amb: Ambiente): number {
  const g = umaGaveta(gs, refs, "ficha");
  if (values.de) {
    g.definirFicha(readFileSync(values.de, "utf8"));
    amb.out.write(`Ficha da gaveta ${g.numero} actualizada.\n`);
  } else {
    amb.out.write(`${g.dados.ficha.trim() || "(sem ficha)"}\n`);
  }
  return 0;
}

function acaoCriar(gs: Gavetas, args: string[], values: Valores, amb: Ambiente): number {
  const nome = args.join(" ").trim();
  if (!nome) throw new ErroKeyring("uso", "Uso: keyring sudo criar <nome> [--entidade texto] [--ficha-de ficheiro]");
  const ficha = values["ficha-de"] ? readFileSync(values["ficha-de"], "utf8") : "";
  const g = gs.criar(nome, values.entidade ?? nome, ficha, values.numero === undefined ? undefined : Number(values.numero));
  amb.out.write(`Criada a gaveta ${g.numero}: ${g.nome}\n`);
  return 0;
}

function acaoProjecto(gs: Gavetas, args: string[], values: Valores, comando: string[], amb: Ambiente): Promise<number> | number {
  const [sub, nome, ...resto] = args;
  if (sub === undefined) {
    const lista = gs.projectos();
    amb.out.write(lista.length === 0 ? "Nenhum projecto ainda. Crie com: keyring sudo projecto criar <nome> --descricao <texto>\n" : `${lista.map((p) => `${p.nome} — ${p.descricao} (${p.itens.length} itens)`).join("\n")}\n`);
    return 0;
  }
  if (sub === "criar") {
    if (!nome) throw new ErroKeyring("uso", "Uso: keyring sudo projecto criar <nome> --descricao <texto>");
    gs.criarProjecto(nome, values.descricao ?? "");
    amb.out.write(`Projecto «${nome}» criado.\n`);
    return 0;
  }
  if (sub === "adicionar") {
    if (!nome || resto.length === 0) throw new ErroKeyring("uso", "Uso: keyring sudo projecto adicionar <nome> <gaveta>/<item> …");
    for (const ref of resto) {
      const barra = ref.indexOf("/");
      if (barra < 1) throw new ErroKeyring("uso", `«${ref}» não é <gaveta>/<item> (ex.: 1/cloudflare.api_token).`);
      gs.adicionarAoProjecto(nome, gs.resolver(ref.slice(0, barra)).numero, ref.slice(barra + 1));
    }
    amb.out.write(`Projecto «${nome}» actualizado.\n`);
    return 0;
  }
  // `projecto <nome>` mostra; `projecto <nome> correr -- cmd` corre
  const p = gs.projecto(sub);
  if (nome === "correr") return correr(gs.resolverProjecto(p.nome), comando, { out: amb.out, err: amb.err });
  amb.out.write(`${p.nome} — ${p.descricao}\n${p.itens.map((r) => `  ${r.gaveta}/${r.item}`).join("\n") || "  (sem itens)"}\n`);
  return 0;
}

async function pedirFrase(amb: Ambiente, repetir: boolean): Promise<string> {
  const doEnv = amb.env.KEYRING_FRASE;
  if (doEnv !== undefined) return doEnv;
  const frase = await amb.lerOculto("Frase-passe da cópia de recuperação: ");
  if (repetir && frase !== (await amb.lerOculto("Repita a frase-passe: "))) throw new ErroKeyring("frase", "As duas frases-passe não são iguais.");
  return frase;
}

async function acaoExportar(gs: Gavetas, refs: string[], args: string[], amb: Ambiente): Promise<number> {
  const g = umaGaveta(gs, refs, "exportar");
  const destino = args[0];
  if (!destino) throw new ErroKeyring("uso", "Uso: keyring sudo <gaveta> exportar <destino> (um ficheiro ou uma pasta)");
  const ficheiro = ehPasta(destino) ? join(destino, `${nomeSeguro(g.nome)}-${hoje().replaceAll("-", "")}.keyring`) : destino;
  const dados = exportarGaveta(g, await pedirFrase(amb, true));
  mkdirSync(dirname(resolve(ficheiro)), { recursive: true });
  writeFileSync(ficheiro, dados);
  amb.out.write(`Cópia de recuperação escrita em ${ficheiro}\nGuarde-a num disco externo (nunca num servidor) e não perca a frase-passe: sem ela o ficheiro não abre.\n`);
  return 0;
}

async function acaoImportar(gs: Gavetas, args: string[], values: Valores, amb: Ambiente): Promise<number> {
  const origem = args[0];
  if (!origem) throw new ErroKeyring("uso", "Uso: keyring sudo importar <ficheiro> [--numero N]");
  try {
    const g = importarGaveta(gs, readFileSync(origem), await pedirFrase(amb, false), values.numero === undefined ? undefined : Number(values.numero));
    amb.out.write(`Importada a gaveta ${g.numero}: ${g.nome} (${g.dados.itens.length} itens).\n`);
    return 0;
  } catch (e) {
    if (e instanceof ErroKeyring && e.codigo === "numero") throw new ErroKeyring("numero", `${e.message} Use --numero <livre> para a importar com outro número.`);
    throw e;
  }
}