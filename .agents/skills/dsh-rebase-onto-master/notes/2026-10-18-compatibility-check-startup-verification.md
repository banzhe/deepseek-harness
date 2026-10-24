# Correct the dsh-compatibility-check startup and HTTP verification steps

- Kind: requirement
- Status: local
- Identifying paths:
  - .agents/skills/dsh-compatibility-check/SKILL.md
- Unique strings or tests:
  - `pnpm dsh web --port 23008 --no-open`
  - `token step`
  - `cookie step`

## Intent

Corrects the `dsh-compatibility-check` skill: drops the `--profile` argument because `pnpm dsh web` already selects the default profile, adds a `build:artifacts` step before startup for linked packages that lack `lib/client.js`, and replaces the single token-URL HTTP check with a two-step check (token URL returns 303 and sets the auth cookie; the cookie then yields 200). This is skill documentation, not product code.

## Already-on-master test

Search the named base for the corrected startup line: `git grep -n -F -- 'pnpm dsh web --port 23008 --no-open' <base> -- .agents/skills/dsh-compatibility-check/SKILL.md`. Landed only when the corrected text exists. Current result: `.agents/skills/dsh-compatibility-check/SKILL.md` is absent from the 0.2.1-rc.3 base, so the correction is not-landed.
