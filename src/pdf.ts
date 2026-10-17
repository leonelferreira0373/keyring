/** Um PDF só de texto (Courier, WinAnsi), sem dependências: A4, margens de 40 pt, várias páginas. */
const LARGURA = 595;
const ALTURA = 842;
const MARGEM = 40;
const TAMANHO = 9;
const ENTRELINHA = 11;
const COLUNAS = Math.floor((LARGURA - 2 * MARGEM) / (TAMANHO * 0.6));
const LINHAS_POR_PAGINA = Math.floor((ALTURA - 2 * MARGEM) / ENTRELINHA);

const WINANSI: Record<number, number> = {
  0x20ac: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
};

/** Uma linha de texto Unicode → o conteúdo de uma string PDF (parênteses, barras e bytes altos escapados). */
function codificar(linha: string): string {
  let r = "";
  for (const ch of linha) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    let b: number;
    if (cp >= 0x20 && cp <= 0x7e) b = cp;
    else if (cp >= 0xa0 && cp <= 0xff) b = cp;
    else b = WINANSI[cp] ?? 0x3f;
    if (b === 0x5c || b === 0x28 || b === 0x29) r += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) r += `\\${b.toString(8).padStart(3, "0")}`;
    else r += String.fromCharCode(b);
  }
  return r;
}

function quebrar(texto: string): string[] {
  const saida: string[] = [];
  for (const linha of texto.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let resto = linha;
    while (resto.length > COLUNAS) {
      let corte = resto.lastIndexOf(" ", COLUNAS);
      const noEspaco = corte > COLUNAS / 2;
      if (!noEspaco) corte = COLUNAS;
      saida.push(resto.slice(0, corte));
      resto = noEspaco ? resto.slice(corte + 1) : resto.slice(corte);
    }
    saida.push(resto);
  }
  return saida;
}

export function pdfDeTexto(texto: string): Buffer {
  const linhas = quebrar(texto);
  const paginas: string[][] = [];
  for (let i = 0; i < linhas.length; i += LINHAS_POR_PAGINA) paginas.push(linhas.slice(i, i + LINHAS_POR_PAGINA));
  if (paginas.length === 0) paginas.push([""]);

  const objs: Buffer[] = [];
  const add = (conteudo: string): number => {
    objs.push(Buffer.from(conteudo, "latin1"));
    return objs.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add("<< >>"); // 2: as páginas, preenchido no fim
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"); // 3
  const ids: number[] = [];
  for (const pagina of paginas) {
    const corpo =
      `BT /F1 ${TAMANHO} Tf ${MARGEM} ${ALTURA - MARGEM - TAMANHO} Td ${ENTRELINHA} TL\n` +
      pagina.map((l) => `(${codificar(l)}) Tj T*`).join("\n") +
      "\nET";
    const conteudo = add(`<< /Length ${Buffer.byteLength(corpo, "latin1")} >>\nstream\n${corpo}\nendstream`);
    ids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${conteudo} 0 R >>`));
  }
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${ids.map((i) => `${i} 0 R`).join(" ")}] /Count ${ids.length} >>`, "latin1");

  const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets: number[] = [];
  let pos = partes[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    partes.push(b);
    pos += b.length;
  });
  const xref =
    ["xref", `0 ${objs.length + 1}`, "0000000000 65535 f "].concat(offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `)).join("\n") + "\n";
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(partes);
}
