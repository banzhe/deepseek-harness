# my_dev release ignores documentation-only pushes

- Kind: fix
- Status: local
- Identifying paths:
  - .github/workflows/my-dev-electron-release.yml
- Unique strings or tests:
  - `paths-ignore` under `on.push`
  - `.agents/**`, `**/*.i18n.yaml`, `**/AGENTS.md`

## Intent

A push that only changes documentation or agent material no longer starts the my_dev release, which otherwise built three platforms and published both a GitHub Release and an npm version for it. Markdown under `packages/` and `apps/` is named pattern by pattern instead of through `**/*.md`, because skill Markdown such as `packages/skill/skill-office/assets/office-docx/SKILL.md` ships inside the executable and belongs in a release.

## Already-on-master test

Search the base for `paths-ignore` in `.github/workflows/my-dev-electron-release.yml`; the workflow is local-only, so no match means this fix has not landed.
