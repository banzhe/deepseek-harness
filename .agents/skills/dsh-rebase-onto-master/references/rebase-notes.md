# 变基后必须核对的版本与锁文件

[dsh-rebase-onto-master](../SKILL.md) 的变基流程在第 8、9 节之间使用本页。两条规则都只在打包与发布路径上暴露，普通的构建、类型检查与单元测试抓不到，所以必须显式执行下面的验证命令。

## 1. 家族版本同步

DSH 家族（`packages/*/*/package.json` 与 `apps/*/package.json`）必须共用一个版本，且等于根 `package.json` 的 `version`（[scripts/release/families.ts](../../../../scripts/release/families.ts) 的 `DshFamily.patterns` 与 `verifyVersions`）。

基线上游一旦升版本（主题为 `release(dsh): <version>` 的发布提交，或等价的对齐提交），根版本就变了。此时：

- 本地分支独有、基线中不存在的包（例如 `packages/session/llm-network-stats/package.json`）不会自动跟着变，必须自己同步。
- 新增这类包时，在添加它的提交里就写入当时的根版本；已经存在的，变基之后逐个核对。
- 版本号只认根 `package.json`，不要保留引入时写下的旧版本。

失败指纹：

```text
Error: dsh release members must share one version:
packages/session/llm-network-stats: <旧版本>
    at DshFamily.verifyVersions (scripts/release/families.ts:369:13)
    at packFamilyMembers (scripts/release/pack.ts:98:10)
    at main (apps/desktop/scripts/pack-local-packages.ts:24:24)
```

桌面打包（`apps/desktop/scripts/pack-local-packages.ts`）与 `scripts/prepare-runtime.ts` 都会触发它，所以在 GitHub Actions 的 `my_dev release` 里表现为 `Build unsigned ... installer` 步骤失败，而本地构建与测试全绿。

## 2. 锁文件与实际部署闭包一致

单文件 exe 的运行时闭包由 `scripts/build-exe-for-python-sdk.ts` 的 `deployStaging()` 生成：

```sh
pnpm --filter dsh-python-runtime-closure deploy --legacy --prod \
  --config.allow-unused-patches=true --config.node-linker=hoisted \
  --config.auto-install-peers=false --config.link-workspace-packages=true \
  --config.hoist-workspace-packages=false <staging>
```

hoisted linker 走 legacy deploy 实现，pnpm 会明确提示它读不到 workspace 锁（`A pnpm-lock.yaml file exists. The current configuration prohibits to read or write a lockfile`），因此这份闭包按 registry 重新解析。构建随后要求闭包里每个 npm 包都能在 `pnpm-lock.yaml` 里找到带 sha512 integrity 的条目（`scripts/build-exe-for-python-sdk-office.ts:31` 的 `runtimeNpmArchive`）。

于是任何传递依赖在区间内发布新版本，都会让锁文件与闭包不一致并中断发布。修法是在 [pnpm-workspace.yaml](../../../../pnpm-workspace.yaml) 的 `overrides` 里把该包固定到闭包解析出的版本，再 `pnpm install` 刷新锁；不要放宽完整性校验。

失败指纹：

```text
Error: runtime npm lock: missing SHA-512 integrity for <name>@<version>
    at runtimeNpmArchive (scripts/build-exe-for-python-sdk-office.ts:31:11)
    at async SingleExeBuild.pack (scripts/build-exe-for-python-sdk.ts:444:22)
```

## 3. 强制验证

变基完成后、提交之前，运行：

```sh
pnpm exec tsx scripts/release/verify.ts --family dsh --skip-tag-check
```

退出码非 0 时不要提交，也不要推送。它同时覆盖规则 1（全部家族成员共用一个版本）与发布顺序，是这两类问题的唯一本地闸门。

规则 2 无法在没有部署闭包时直接验证；涉及 `pnpm-lock.yaml` 的重放完成后，至少确认锁文件记录的版本与 `pnpm-workspace.yaml` 的 `overrides` 一致，并在报告中注明未做闭包级验证。
