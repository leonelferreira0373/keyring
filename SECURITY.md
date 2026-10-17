# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: **Security → Report a vulnerability** on the repository page. Include what you found, how to reproduce it, and the impact you see. You will get an answer as soon as possible.

## What Keyring protects, and what it does not

- **Protects:** the vault files at rest. Keys are protected with Windows DPAPI (current-user scope) and items are encrypted with AES-256-GCM, so the files are useless on another PC or under another Windows account.
- **Does not protect against:** code running as you, on your logged-in PC. Such code can open a sudo session and ask Keyring to run a command with your secrets. The default sudo password (`1234`) is a speed bump for casual use, not a security boundary; change it with `keyring sudo passwd`.
- **Output redaction** in `correr` replaces known secret values with `***`, but it is best effort: values shorter than 6 characters are not redacted, and a command can transform a secret (encode, split, hash) before printing it.
- `rec`, `copiar`, `abrir` and `tirar` deliberately expose secrets in plain text (file, clipboard or temp folder). They are meant for a human in a terminal.

Reports that need a different threat model (for example "an attacker with your Windows session can read your secrets") are known limitations rather than vulnerabilities, but suggestions to narrow them are welcome as ordinary issues.
