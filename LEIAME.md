# Keyring

Um **cofre local de segredos para Windows**, organizado em **gavetas** numeradas (uma por empresa ou projecto) com valores, notas e ficheiros de qualquer tipo. Foi feito para que **agentes de IA e scripts usem as tuas credenciais sem nunca as verem**: os segredos entram no ambiente de um comando e a saída do comando sai censurada.

- **Só local.** Nada sai do PC: sem servidor, sem conta, sem rede.
- **Trancado pelo Windows.** A chave dos dados está protegida pelo DPAPI do Windows (utilizador actual); só a tua conta abre. Os itens são cifrados com AES-256-GCM.
- **Amigo da IA.** `keyring` mostra o índice completo (gavetas, itens, estados, sem valores) e `keyring ajuda-ia` as regras para um agente. `keyring sudo <gaveta> correr -- <comando>` corre o comando com os segredos como variáveis de ambiente e troca qualquer segredo na saída por `***`.
- **Sem dependências.** Node.js simples e PowerShell.
- **Recuperável.** Histórico dos itens (5 versões anteriores), exportação cifrada de uma gaveta e impressão em PDF ou texto.

English: [README.md](README.md).

## Requisitos

Windows 10 ou 11, [Node.js](https://nodejs.org) 24 ou superior, e Git.

## Instalar

```powershell
git clone https://github.com/leonelferreira0373/keyring.git
cd keyring
npm install
npm link          # o comando `keyring` fica disponível em todo o PC
keyring           # mostra o índice (vazio no início)
```

Para actualizar: `git pull && npm install`. Para desinstalar: `npm unlink -g keyring` (os dados ficam em `%USERPROFILE%\.keyring\`). Testes: `npm test` · Tipos: `npm run tipos`.

## Começar

```powershell
# 1. abre a sessão (15 minutos, para todo o PC). A password predefinida é 1234: muda-a logo.
echo 1234 | keyring sudo
keyring sudo passwd

# 2. cria uma gaveta e guarda um segredo (o valor é pedido sem aparecer)
keyring sudo criar "A Minha Empresa" --entidade ME
keyring sudo "a minha empresa" pôr github.token --env GITHUB_TOKEN --descricao "token do CI"

# 3. usa-o sem o mostrar
keyring sudo "a minha empresa" correr -- bash -c 'curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user'
```

Uma gaveta diz-se pelo **número** (`1`) ou pelo **nome** (`"a minha empresa"`, sem maiúsculas nem acentos). Nomes com espaços vão entre aspas.

## Comandos

Tudo o que mexe em segredos começa por `keyring sudo`. Sem `sudo` só se vêem nomes e estados.

| Comando | O que faz |
| --- | --- |
| `keyring` | Índice de gavetas, itens, estados e projectos (sem valores). `--json` para programas |
| `keyring ls` | Lista as gavetas |
| `keyring ajuda-ia` | O guia e as regras para uma IA |
| `keyring sudo` | Abre a sessão (`--minutos N`, de 1 a 1440; `-k` fecha; `passwd` muda a password) |
| `keyring sudo criar <nome> [--entidade X] [--ficha-de ficheiro.md] [--numero N]` | Cria uma gaveta |
| `keyring sudo <gaveta> ls` | Lista os itens (valores censurados fora de um terminal; `--mostrar` mostra-os sempre) |
| `keyring sudo <gaveta> pôr <item> [ficheiro] [--env VAR] [--descricao "…"] [--tipo nota] [--stdin]` | Guarda um valor, um ficheiro ou uma nota |
| `keyring sudo <gaveta> correr -- <comando>` | Corre o comando com os segredos da gaveta no ambiente, saída censurada |
| `keyring sudo <gaveta> estado <item> ok\|rodar\|revogado` | Marca o estado (os revogados nunca se injectam) |
| `keyring sudo <gaveta> copiar <item>` | Copia o valor; a área de transferência limpa-se em 30 s |
| `keyring sudo <gaveta> abrir <item>` | Abre uma nota ou ficheiro na aplicação do Windows (pasta temporária que se apaga) |
| `keyring sudo <gaveta> tirar <item> <pasta>` | Extrai um ficheiro para uma pasta |
| `keyring sudo <gaveta> remover <item>` | Apaga o item e as versões antigas |
| `keyring sudo <gaveta> ficha [--de ficheiro.md]` | Mostra ou define a ficha da gaveta (não é secreta) |
| `keyring sudo <gaveta> rec txt\|pdf [caminho]` | Imprime a gaveta inteira, valores incluídos |
| `keyring sudo <gaveta> exportar <pasta>` | Cópia de recuperação cifrada (frase-passe de 8+ caracteres) |
| `keyring sudo importar <ficheiro.keyring>` | Repõe uma cópia |
| `keyring sudo projecto criar\|adicionar\|<nome> …` | Agrupa itens de várias gavetas; `projecto <nome> correr -- <cmd>` carrega-os todos |

O guia completo, com exemplos: [`docs/keyring-guia.pdf`](docs/keyring-guia.pdf) (Português) e [`docs/keyring-guide.pdf`](docs/keyring-guide.pdf) (English).

## Usar com um agente de IA

No ficheiro de instruções do agente (por exemplo `CLAUDE.md` ou `AGENTS.md`):

```markdown
Quando uma tarefa precisar de credenciais, corre `keyring` (sem argumentos) para ver o que existe e `keyring ajuda-ia` para as regras.
Usa os segredos só com `keyring sudo <gaveta> correr -- <comando>`; nunca imprimas um valor.
A sessão abre-se com `echo <password> | keyring sudo`.
```

## Segurança (lê)

- A força vem do **DPAPI do Windows + AES-256-GCM**: os ficheiros não servem noutro PC nem noutra conta.
- A **password do sudo não é a fronteira de segurança**: trava o uso casual; a predefinida `1234` está documentada de propósito para os agentes abrirem sessões em scripts. Muda-a com `keyring sudo passwd`.
- Tudo o que corre **como tu, no teu PC com a sessão aberta**, pode pedir ao Keyring para correr um comando com os teus segredos. Não corras código ou agentes de confiança duvidosa com acesso à tua conta.
- `rec` e `copiar` põem segredos em texto simples no disco ou na área de transferência: são para ti, num terminal, nunca para um agente.

Para comunicar uma vulnerabilidade: [SECURITY.md](SECURITY.md). Licença: [MIT](LICENSE).
