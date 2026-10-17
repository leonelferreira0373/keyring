# Contributing

Thanks for helping. Keyring is small on purpose: no runtime dependencies, one file per concern in `src/`.

## Setup

```powershell
git clone https://github.com/leonelferreira0373/keyring.git
cd keyring
npm install
npm test          # node --test, 100+ tests
npm run tipos     # tsc --noEmit
```

Requires Windows 10/11 and Node.js 24 or newer (TypeScript runs natively through type stripping, so there is no build step).

## Guidelines

- Add a test for every change in behaviour (`test/*.test.ts`); tests use a temporary `KEYRING_DIR` and never touch your real vault.
- Keep the code dependency-free and the secrets out of logs, error messages and command lines.
- Match the surrounding style. User-facing messages are Portuguese; code comments and docs may be Portuguese or English.
- Open an issue before a large change.

## Good first contributions

- **English command aliases** (`create`, `put`, `run`, `state`, `copy`, `open`, `extract`, `remove`, `export`, `import`, `project`) next to the Portuguese ones, with an English help text.
- macOS and Linux back-ends for the key protection (Keychain, libsecret) behind the same interface as the DPAPI one in `src/tranca.ts`.
- More languages for the guide in `docs/`.

## Pull requests

Small, focused pull requests with a clear description are easiest to review. CI runs `npm run tipos` and `npm test` on Windows.
