# CLI Interface Gap: `zi` vs `pi`

Last updated: 2026-02-14

## Scope

- `zi`: `src/cli.ts`, `src/index.ts`
- `pi` (coding-agent): `z/pi-mono/packages/coding-agent/src/cli/args.ts`, `z/pi-mono/packages/coding-agent/src/main.ts`

## Subcommands

### `zi`

- Has subcommands:
1. `install <source> [-l|--local]`
2. `remove <source> [-l|--local]`
3. `update [source]`
4. `list`
5. `config`

### `pi`

- Has subcommands:
1. `install <source> [-l|--local]`
2. `remove <source> [-l|--local]`
3. `update [source]`
4. `list`
5. `config`

## Flags Present in `zi`

1. `-c, --continue`
2. `-r, --resume <ID>`
3. `--provider <NAME>`
4. `--model <MODEL>`
5. `--system-prompt <TEXT>`
6. `--append-system-prompt <TEXT>`
7. `--no-session`
8. `-p, --print`
9. `-h, --help`
10. `-v, --version`

## Flags Present in `pi` but Missing in `zi`

1. `--export <file>`
2. `--extension, -e <path>`
3. `--no-extensions, -ne`
4. `--skill <path>`
5. `--no-skills, -ns`
6. `--prompt-template <path>`
7. `--no-prompt-templates, -np`
8. `--theme <path>`
9. `--no-themes`
10. `--verbose`

## Behavioral Mismatches (Same/Similar Names, Different Semantics)

1. `--model`
- `zi`: plain model string only.
- `pi`: supports provider-prefixed forms and model resolution behavior (`provider/id`, thinking suffixes).

2. `--print/-p`
- `zi`: non-interactive text output path only.
- `pi`: non-interactive mode integrated with `--mode` (`text`, `json`, `rpc`).

## Interface Features in `pi` Missing in `zi` (Not Just Flags)

1. Two-pass argument parsing for extension-provided custom flags.
2. Runtime extension/skill/theme/prompt-template loading controls.

## Quick Answer: "サブコマンドは？"

- `zi`: `install`, `remove`, `update`, `list`, `config`
- `pi`: `install`, `remove`, `update`, `list`, `config`
