import type { Gavetas } from "./gavetas.ts";
import type { Estado, TipoItem } from "./modelo.ts";

export interface IndiceItem {
  nome: string;
  tipo: TipoItem;
  estado: Estado;
  env?: string;
  nota?: string;
  verificadoEm?: string;
  etiquetas: string[];
  tamanho?: number;
  versoes: number;
}
export interface IndiceGaveta {
  numero: number;
  nome: string;
  entidade: string;
  ficha: string;
  total: number;
  rodar: number;
  revogados: number;
  itens: IndiceItem[];
}
export interface IndiceProjecto {
  nome: string;
  descricao: string;
  itens: { gaveta: number; item: string; estado: Estado | "em-falta" }[];
}
export interface Indice {
  geradoEm: string;
  gavetas: IndiceGaveta[];
  projectos: IndiceProjecto[];
}

/** O mapa de tudo, SEM VALORES. Só nomes, tipos, estados, notas e fichas (que por convenção não são secretas). */
export function construirIndice(gs: Gavetas, hoje: string): Indice {
  const gavetas: IndiceGaveta[] = gs.todas().map((g) => {
    const itens: IndiceItem[] = g.dados.itens.map((i) => ({
      nome: i.nome,
      tipo: i.tipo,
      estado: i.estado,
      env: i.env,
      nota: i.nota,
      verificadoEm: i.verificadoEm,
      etiquetas: i.etiquetas,
      tamanho: i.ficheiro?.tamanho,
      versoes: i.versoes.length,
    }));
    return {
      numero: g.numero,
      nome: g.nome,
      entidade: g.dados.entidade,
      ficha: g.dados.ficha,
      total: itens.length,
      rodar: itens.filter((i) => i.estado === "rodar").length,
      revogados: itens.filter((i) => i.estado === "revogado").length,
      itens,
    };
  });
  const projectos: IndiceProjecto[] = gs.projectos().map((p) => ({
    nome: p.nome,
    descricao: p.descricao,
    itens: p.itens.map((r) => {
      const it = gavetas.find((g) => g.numero === r.gaveta)?.itens.find((i) => i.nome === r.item);
      return { gaveta: r.gaveta, item: r.item, estado: it?.estado ?? "em-falta" };
    }),
  }));
  return { geradoEm: hoje, gavetas, projectos };
}

function coluna(t: string, n: number): string {
  return t.length >= n ? `${t} ` : t.padEnd(n);
}

const COMO_USAR = [
  "Como usar (nunca imprimas um valor):",
  "  keyring sudo <gaveta> ls                      lista os itens de uma gaveta (valores escondidos)",
  "  keyring sudo <gaveta> correr -- <comando>     corre o comando com os segredos da gaveta, sem os mostrar",
  "  keyring sudo projecto <nome> correr -- <cmd>  o mesmo, com tudo o que um projecto precisa",
  "  keyring sudo                                  abre a sessão (a password predefinida é 1234)",
  "  keyring ajuda-ia                              o guia completo e as regras",
];

export function indiceTexto(ind: Indice): string {
  const l: string[] = [`KEYRING — índice (sem valores) · gerado a ${ind.geradoEm}`, "", ...COMO_USAR, ""];
  if (ind.gavetas.length === 0) {
    l.push("Ainda não há gavetas. Crie a primeira com: keyring sudo criar <nome> --entidade <empresa>");
    return `${l.join("\n")}\n`;
  }
  for (const g of ind.gavetas) {
    l.push(`GAVETA ${g.numero} — ${g.nome} (${g.entidade}) · ${g.total} itens · ${g.rodar} a rodar · ${g.revogados} revogados`);
    if (g.ficha.trim()) {
      l.push("  Ficha:");
      for (const linha of g.ficha.trim().split("\n")) l.push(`    ${linha}`);
    }
    if (g.itens.length === 0) {
      l.push("  (sem itens)");
    } else {
      l.push("  Itens:");
      const w = Math.max(...g.itens.map((i) => i.nome.length)) + 2;
      for (const i of g.itens) {
        const partes = [coluna(i.nome, w), coluna(i.tipo, 8), coluna(i.estado, 9)];
        if (i.env) partes.push(`env=${i.env}`);
        if (i.verificadoEm) partes.push(`verificado=${i.verificadoEm}`);
        if (i.tamanho !== undefined) partes.push(`${i.tamanho} bytes`);
        if (i.nota) partes.push(`— ${i.nota}`);
        l.push(`    ${partes.join("  ").trimEnd()}`);
      }
    }
    l.push("");
  }
  if (ind.projectos.length > 0) {
    l.push("PROJECTOS");
    for (const p of ind.projectos) {
      l.push(`  ${p.nome} — ${p.descricao}`);
      l.push(`    precisa de: ${p.itens.map((i) => `${i.gaveta}/${i.item} (${i.estado})`).join(", ") || "(nada ainda)"}`);
    }
    l.push("");
  }
  return `${l.join("\n")}`;
}
