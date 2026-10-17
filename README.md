# Keyring

A **local secrets vault for Windows**, organised in numbered **drawers** (one per company or project) holding values, notes and files of any kind. It is built so that **AI agents and scripts can use your credentials without ever seeing them**: secrets are injected into a command's environment and the command's output is redacted.

- **Local only.** Nothing leaves your PC: no server, no account, no network.
- **Locked by Windows.** The data key is protected with Windows DPAPI (current user), so only your Windows account can open it. Items are encrypted with AES-256-GCM.
- **AI-friendly.** `keyring` prints a complete index (drawers, items, states, no values) and `keyring ajuda-ia` prints the rules an AI agent must follow. `keyring sudo <drawer> correr -- <command>` runs a command with the secrets as environment variables and replaces any secret in the output with `***`.
- **Zero dependencies.** Plain Node.js (TypeScript run natively) and PowerShell.
- **Recoverable.** Item history (5 previous versions), encrypted export/import of a drawer with a passphrase, PDF/text printout of a drawer.

> The command-line interface speaks **Portuguese** (`criar`, `pôr`, `correr`, `estado`, …). English aliases are a welcome contribution, see [CONTRIBUTING.md](CONTRIBUTING.md). Português: [LEIAME.md](LEIAME.md).

## Requirements

- Windows 10 or 11 (uses DPAPI and PowerShell, which ship with Windows)
- [Node.js](https://nodejs.org) **24 or newer**
- Git

## Install

```powershell
git clone https://github.com/leonelferreira0373/keyring.git
cd keyring
npm install
npm link          # makes the `keyring` command available everywhere
keyring           # prints the index (empty at first)
```

To update later: `git pull && npm install`. To uninstall: `npm unlink -g keyring` (your data stays in `%USERPROFILE%\.keyring\`).

Run the tests with `npm test` and the type check with `npm run tipos`.

## Quick start

```powershell
# 1. open a session (15 minutes, for the whole PC). The default password is 1234: change it right away.
echo 1234 | keyring sudo
keyring sudo passwd

# 2. create a drawer and store a secret (the value is asked without echo)
keyring sudo criar "My Company" --entidade MC
keyring sudo "my company" pôr github.token --env GITHUB_TOKEN --descricao "CI token"

# 3. use it without showing it
keyring sudo "my company" correr -- bash -c 'curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user'
```

A drawer can be named by **number** (`1`) or by **name** (`"my company"`, case and accents are ignored). Quote names with spaces.

## Commands

Everything that touches secrets starts with `keyring sudo`. Without `sudo` you only ever see names and states.

| Command | What it does |
| --- | --- |
| `keyring` | Index of every drawer, item, state and project (no values). `--json` for machines |
| `keyring ls` | List the drawers |
| `keyring ajuda-ia` | The guide and rules for an AI agent |
| `keyring sudo` | Open the session (`--minutos N`, 1 to 1440; `-k` closes it; `passwd` changes the password) |
| `keyring sudo criar <name> [--entidade X] [--ficha-de file.md] [--numero N]` | Create a drawer |
| `keyring sudo <drawer> ls` | List a drawer's items (values are masked unless you are in a terminal or pass `--mostrar`) |
| `keyring sudo <drawer> pôr <item> [file] [--env VAR] [--descricao "…"] [--tipo nota] [--stdin]` | Store a value, a file or a note |
| `keyring sudo <drawer> correr -- <command>` | Run a command with the drawer's secrets as environment variables, output redacted |
| `keyring sudo <drawer> estado <item> ok\|rodar\|revogado` | Mark an item ok, to rotate or revoked (revoked items are never injected) |
| `keyring sudo <drawer> copiar <item>` | Copy a value; the clipboard is cleared after 30 s |
| `keyring sudo <drawer> abrir <item>` | Open a note or file in the default Windows app (temp folder, auto-deleted) |
| `keyring sudo <drawer> tirar <item> <folder>` | Extract a file item to a folder |
| `keyring sudo <drawer> remover <item>` | Delete an item and its old versions |
| `keyring sudo <drawer> ficha [--de file.md]` | Show or set the drawer's description (the "ficha"; not secret) |
| `keyring sudo <drawer> rec txt\|pdf [path]` | Print a whole drawer, values included, as text or PDF |
| `keyring sudo <drawer> exportar <folder>` | Encrypted backup of a drawer (asks for a passphrase of 8+ characters) |
| `keyring sudo importar <file.keyring>` | Restore a backup |
| `keyring sudo projecto criar\|adicionar\|<name> …` | Group items from several drawers into a project; `projecto <name> correr -- <cmd>` loads all of them |

The full reference, with examples, is in the guide: [`docs/keyring-guide.pdf`](docs/keyring-guide.pdf) (English) and [`docs/keyring-guia.pdf`](docs/keyring-guia.pdf) (Português).

## Using it with an AI agent

Tell the agent, in its instructions file (for example `CLAUDE.md` or `AGENTS.md`):

```markdown
When a task needs credentials, run `keyring` (no arguments) to see what exists, and `keyring ajuda-ia` for the rules.
Use secrets only through `keyring sudo <drawer> correr -- <command>`; never print a value.
The session is opened with `echo <password> | keyring sudo`.
```

The agent then sees names, states and notes, and can run commands that use the secrets, while the output stays redacted.

## Where the data lives

`%USERPROFILE%\.keyring\` (override with the `KEYRING_DIR` environment variable). Other variables: `KEYRING_SENHA` (the sudo password, for scripts) and `KEYRING_FRASE` (the backup passphrase). Exit codes: `0` ok, `1` explained error, `2` unexpected error; with `--json` errors are printed as JSON on stderr.

## Security model (please read)

- The strength comes from **Windows DPAPI + AES-256-GCM**: the files are useless on another PC or under another Windows account.
- The **sudo password is not the security boundary**. It is a speed bump against casual use; the default `1234` is documented on purpose so that agents can open sessions in scripts. Change it with `keyring sudo passwd`.
- Anything running **as you, on your logged-in PC**, can ask Keyring to run a command with your secrets. Do not run untrusted code or agents with access to your account.
- Values shorter than 6 characters are not redacted in `correr` output.
- `rec` and `copiar` put secrets in plain text on disk or on the clipboard: they are for you, in a terminal, never for an agent.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE)
