import type { Gaveta } from "./gavetas.ts";

const LINHA = "-".repeat(78);

/** O conteúdo legível de uma gaveta, com os valores em claro (é o que o `rec` imprime). `agora` vem de fora, para ser testável. */
export function relatorioTexto(g: Gaveta, agora: string): string {
  const l: string[] = [
    `KEYRING — gaveta ${g.numero}: ${g.nome}`,
    `Entidade: ${g.dados.entidade}`,
    `Gerado em: ${agora}`,
    "AVISO: este ficheiro tem segredos em texto simples. Apague-o quando acabar.",
    "",
    "FICHA",
    g.dados.ficha.trim() || "(sem ficha)",
    "",
    `ITENS (${g.dados.itens.length})`,
    LINHA,
  ];
  for (const i of g.dados.itens) {
    l.push(`${i.nome}  [${i.tipo}, ${i.estado}]`);
    if (i.env) l.push(`  variável: ${i.env}`);
    if (i.nota) l.push(`  nota: ${i.nota}`);
    if (i.verificadoEm) l.push(`  verificado em: ${i.verificadoEm}`);
    if (i.tipo === "ficheiro") {
      l.push(`  ficheiro: ${i.ficheiro?.nomeOriginal ?? i.nome} (${i.ficheiro?.tamanho ?? 0} bytes), não incluído; extraia com: keyring sudo ${g.numero} tirar ${i.nome} <destino>`);
    } else {
      const texto = g.lerItem(i.nome).toString("utf8");
      if (i.tipo === "valor") {
        l.push(`  valor: ${texto}`);
      } else {
        l.push("  texto:");
        for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) l.push(`    ${linha}`);
      }
    }
    l.push(LINHA);
  }
  return `${l.join("\n")}\n`;
}
