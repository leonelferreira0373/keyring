/** O guia que uma IA lê com `keyring ajuda-ia`. Versionado com o programa: nunca fica desactualizado em notas soltas. */
export const AJUDA_IA = `KEYRING — guia para IA

O QUE É
  Um cofre local do Windows com GAVETAS numeradas (1, 2, 3…), uma por empresa ou projecto. Cada gaveta tem uma ficha (o que é o
  projecto, onde corre, armadilhas) e itens: valores secretos, notas e ficheiros de qualquer tipo. Nada sai deste PC.

REGRAS (não negociáveis)
  1. NUNCA imprimas um valor secreto, nem o ponhas num comando visível. Usa \`correr\`: o segredo entra só no comando e a saída vem censurada (***).
  2. NUNCA uses \`ls --mostrar\`, \`rec\`, \`copiar\` ou \`abrir\`: são para o dono, num terminal. Para ti, \`ls\` mostra \`***(comprimento)\`.
  3. Começa sempre por correr \`keyring\` (sem argumentos): dá o mapa de todas as gavetas, itens, estados e projectos, sem valores.
  4. Antes de usares uma credencial, vê o estado: \`rodar\` = usa mas avisa o dono; \`revogado\` = não funciona, não a uses.
  5. Se uma credencial falhar (401/403), ANTES de a marcares confirma que a variável chegou ao comando: um $VAR fora de \`bash -c '…'\` é
     expandido pela tua shell antes do keyring e chega vazio. Só se chegou (por exemplo \`bash -c 'test -n "$VAR" && echo presente'\`) e a
     credencial mesmo assim falha, marca-a: \`keyring sudo <gaveta> estado <item> revogado\` e avisa o dono.
  6. Quando o dono te der uma credencial nova, guarda-a logo na gaveta certa (ver «GUARDAR») e marca-a \`ok\`.

COMEÇAR (sessão sudo)
  keyring                      índice completo, sem valores (não precisa de sudo). Com --json, em JSON.
  keyring ls                   lista as gavetas (número, nome, entidade, itens)
  echo 1234 | keyring sudo     abre a sessão por 15 minutos para todo o PC (1234 é a password predefinida; se o dono a mudou, ele diz-ta).
                               Com a sessão aberta, \`keyring sudo …\` não volta a pedir a password.

USAR OS SEGREDOS (o que tu fazes)
  keyring sudo <gaveta> correr -- <comando…>            corre o comando com os itens da gaveta que têm variável de ambiente (env)
  keyring sudo projecto <nome> correr -- <comando…>     o mesmo, com tudo o que um projecto precisa (pode misturar gavetas)
  Os itens do tipo ficheiro chegam como um caminho numa variável de ambiente (ficheiro temporário privado, apagado no fim).
  Exemplo: keyring sudo acme correr -- bash -c 'curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify'
  (as variáveis usam-se DENTRO do comando filho: o \`$VAR\` vai entre plicas para o \`bash -c\` o expandir; sem plicas a tua shell expande-o antes e chega vazio).
  O \`--json\` (e qualquer outro argumento) a seguir ao \`--\` é do comando filho: o keyring não lhe mexe.

VER
  keyring sudo <gaveta> ls           itens de uma gaveta (nome, tipo, estado, variável, nota); valores escondidos
  keyring sudo projecto              lista os projectos; \`projecto <nome>\` mostra do que precisa

GUARDAR (a sessão tem de estar aberta: \`echo 1234 | keyring sudo\`; com --stdin a entrada é o valor)
  printf %s '<valor>' | keyring sudo <gaveta> pôr <nome> --stdin --env NOME_DA_VARIAVEL --descricao "para que serve"
  keyring sudo <gaveta> pôr <nome> <caminho-do-ficheiro> [--env VAR]       guarda um ficheiro (qualquer tipo)
  keyring sudo <gaveta> pôr <nome> <ficheiro> --tipo nota                  guarda um texto
  Nomes de item: minúsculas, números, ponto, hífen, sublinhado (ex.: cloudflare.api_token). Variáveis: MAIÚSCULAS_COM_SUBLINHADO.
  Valores com menos de 6 caracteres NÃO são censurados na saída do \`correr\`.

ESTADOS
  keyring sudo <gaveta> estado <item> ok|rodar|revogado       (ok marca a data de hoje)

FORMATO JSON (--json)
  keyring --json  →  { geradoEm, gavetas: [{ numero, nome, entidade, ficha, total, rodar, revogados, itens: [{ nome, tipo, estado, env?, nota?, verificadoEm?, etiquetas, tamanho?, versoes }] }], projectos: [{ nome, descricao, itens: [{ gaveta, item, estado }] }] }
  Os erros em JSON vão para o stderr: { "erro": { "codigo", "mensagem" } }. Código de saída 0 = bem; 1 = erro explicado; 2 = erro inesperado.

GAVETAS PELO NOME OU PELO NÚMERO
  keyring sudo 1 ls  =  keyring sudo acme ls. Um nome com espaços vai entre plicas: keyring sudo 'Acme Corp' ls.

LIMITES
  Só funciona em sessões que correm neste PC com a conta do dono no Windows. Notas e fichas NÃO são secretas: não lá ponhas passwords.
`;
