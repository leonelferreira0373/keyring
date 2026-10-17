/** Valores com menos de 6 caracteres não se censuram (uma porta, «admin»…): estragavam a saída sem proteger nada. */
export const MIN_REDACCAO = 6;

/**
 * Censura em fluxo: troca cada segredo por `***` mesmo que chegue partido entre dois pedaços da saída.
 * Retém só o fim do texto (comprimento do maior segredo menos 1), que pode ser o princípio de um segredo.
 */
export class Redator {
  private segredos: string[];
  private reter: number;
  private resto = "";
  private substituto: string;

  constructor(segredos: string[], substituto = "***") {
    this.segredos = [...new Set(segredos)].filter((s) => s.length >= MIN_REDACCAO).sort((a, b) => b.length - a.length);
    this.reter = this.segredos.length === 0 ? 0 : this.segredos[0].length - 1;
    this.substituto = substituto;
  }

  private trocar(texto: string): string {
    let r = texto;
    for (const s of this.segredos) r = r.split(s).join(this.substituto);
    return r;
  }

  empurrar(pedaco: string): string {
    this.resto += pedaco;
    const tudo = this.trocar(this.resto);
    if (this.reter === 0) {
      this.resto = "";
      return tudo;
    }
    if (tudo.length <= this.reter) {
      this.resto = tudo;
      return "";
    }
    this.resto = tudo.slice(tudo.length - this.reter);
    return tudo.slice(0, tudo.length - this.reter);
  }

  fim(): string {
    const r = this.trocar(this.resto);
    this.resto = "";
    return r;
  }
}
