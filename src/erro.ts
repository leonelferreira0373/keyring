/** Erro com um código estável (para `--json` e para as IA) e uma mensagem em português que diz o que fazer. */
export class ErroKeyring extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroKeyring";
    this.codigo = codigo;
  }
}
