import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { ErroKeyring } from "./erro.ts";

const VERSAO = 1;
const TAMANHO_NONCE = 12;
const TAMANHO_TAG = 16;
export const TAMANHO_CHAVE = 32;

function verificarChave(chave: Buffer): void {
  if (chave.length !== TAMANHO_CHAVE) throw new ErroKeyring("chave", "A chave de cifra tem de ter 32 bytes.");
}

export function novaChave(): Buffer {
  return randomBytes(TAMANHO_CHAVE);
}

/** Formato: [versão 1 byte][nonce 12][texto cifrado][etiqueta 16]. O `aad` liga o selado à sua identidade. */
export function cifrar(chave: Buffer, claro: Buffer, aad: string): Buffer {
  verificarChave(chave);
  const nonce = randomBytes(TAMANHO_NONCE);
  const c = createCipheriv("aes-256-gcm", chave, nonce);
  c.setAAD(Buffer.from(aad, "utf8"));
  const cifrado = Buffer.concat([c.update(claro), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), nonce, cifrado, c.getAuthTag()]);
}

export function decifrar(chave: Buffer, selado: Buffer, aad: string): Buffer {
  verificarChave(chave);
  if (selado.length < 1 + TAMANHO_NONCE + TAMANHO_TAG || selado[0] !== VERSAO) {
    throw new ErroKeyring("formato", "Ficheiro cifrado com formato desconhecido ou truncado.");
  }
  const nonce = selado.subarray(1, 1 + TAMANHO_NONCE);
  const tag = selado.subarray(selado.length - TAMANHO_TAG);
  const cifrado = selado.subarray(1 + TAMANHO_NONCE, selado.length - TAMANHO_TAG);
  const d = createDecipheriv("aes-256-gcm", chave, nonce);
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(cifrado), d.final()]);
  } catch {
    throw new ErroKeyring("adulterado", "Não consegui decifrar: a chave está errada ou o ficheiro foi alterado.");
  }
}

/** Chave a partir de uma frase-passe (cópia de recuperação). `scrypt` N=2^17, r=8, p=1 usa ~128 MB. */
export function derivarChave(frase: string, sal: Buffer): Buffer {
  return scryptSync(frase.normalize("NFKC"), sal, TAMANHO_CHAVE, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
}
