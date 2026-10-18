---
name: dsh-compatibility-check
description: 检查 DSH 配置与插件是否与当前版本兼容。以 deepseek-harness 的 my_dev 版本为目标，先拉取 /root/CODE/dsh-plugins 与 DSH home 配置的最新提交，核对插件 peerDependencies 范围与 profile 依赖，再从 DSH home 启动 dsh web（端口 23008）检查加载错误。官方插件按 changeset 升版本，dsh-plugins 中的插件若不兼容则做适配。适配完成后提交配置与插件并创建 PR。当升级 DSH 版本、变基之后、修改插件或 profile 配置，或用户要求检查兼容性时使用。
---

# 检查配置与插件的兼容性

本 skill 检查三件事：插件的 peer 版本范围、profile 的依赖与配置、启动后的实际加载结果。变基本身的流程见 [dsh-rebase-onto-master](../dsh-rebase-onto-master/SKILL.md)。

## 0. 确定输入

- **DSH 版本**：取 `/root/CODE/deepseek-harness` 当前分支（`my_dev`）的版本，读取 `packages/bundle/web-app/package.json` 的 `version`。用户指定版本时以用户为准。
- **插件目录**：`/root/CODE/dsh-plugins`，分支 `master`。
- **DSH home 配置目录**：`/root/CODE/.dsh`，分支 `main`，profile 位于 `profiles/<name>`。
- **DSH 检出目录**：`/root/CODE/deepseek-harness`，用于运行启动命令与 semver 检查。

## 1. 拉取最新配置

1. 先拉取插件目录与配置目录，只允许快进：

```sh
git -C /root/CODE/dsh-plugins pull --ff-only origin master
git -C /root/CODE/.dsh pull --ff-only origin main
```

2. 若拉取失败（本地有分歧或未提交改动），停止并报告，不要强制覆盖。`/root/CODE/.dsh` 可能存在无关的未提交改动（例如 `.githooks` 的文件模式），拉取前用 `git status` 确认。

## 2. 插件 peer 范围

插件的 `version` 与 DSH 版本无关，由 changesets 独立管理。兼容性只看 `peerDependencies` 中 `@deepseek-ai/*` 的范围。

1. 列出每个插件的 peer 范围（用绝对路径，避免相对路径解析失败）：

```sh
for f in /root/CODE/dsh-plugins/plugins/*/package.json; do
  node -e 'const p=require(process.argv[1]);
    const peers=Object.entries(p.peerDependencies??{}).filter(([k])=>k.startsWith("@deepseek-ai/")).map(([k,v])=>k+"@"+v).join(" ");
    console.log(p.name, "version="+p.version, "engines.dsh="+(p.engines?.dsh??"-"), peers||"-")' "$f"
done
```

2. 用 semver 判断范围是否包含目标版本。在 DSH 检出目录运行，以复用其 `node_modules`：

```sh
cd /root/CODE/deepseek-harness && node -e "console.log(require('semver').satisfies('<version>', '<range>'))"
```

prerelease 规则：`^0.2.1-alpha.2` 会匹配 `0.2.1-rc.2`。

3. 不兼容的插件记为 **blocked**，写出其范围与目标版本。
4. 只有插件确实与新版本不兼容，并且同一改动中已完成适配，才修改 peer 范围（依据 `dsh-plugins/AGENTS.md`）。不要因为 DSH 发布了新版本就提升 peer 范围。
5. 有 `engines.dsh` 时才检查它；当前插件都没有该字段，缺失不算错误。

## 3. 插件版本与 changeset（仅官方插件升级时）

1. 插件版本由 changesets 管理。**不要手改 `version` 或 `CHANGELOG.md`**。
2. 需要发布的插件，在插件仓库执行 `pnpm changeset` 生成 changeset 文件，然后提交该文件。
3. profile 的依赖版本（`$DSH_HOME/profiles/<name>/package.json` 中的 `@banzhe/*`）必须与插件 `package.json` 的 `version` 一致。版本变化后同步改 profile 中对应的条目。

## 4. profile 与配置

1. **依赖与 bundle**：读取 `profiles/<name>/package.json`，核对 `dependencies` 的版本是否与插件当前 `version` 一致，以及 `dsh.profile.bundles` 中的每一项是否能解析。
2. **组合结果**：

```sh
cd /root/CODE/deepseek-harness && DSH_HOME=/root/CODE/.dsh pnpm dsh web --profile <name> --dump-config
```

3. **残留 id**：`cordis.patch.yml` 中的插件 id 若在组合结果中不存在，记为 blocked。
4. **凭据与设置**：只检查变量名或键名，不读取、不复制、不记录值（例如 `.credentials.yaml` 的 refs 段）。

## 5. 启动验证（端口 23008）

1. 确认端口空闲：`ss -ltn | grep ':23008 '`。若已占用，报告占用进程，不要抢占。
2. 启动，把 stdout 与 stderr 写入日志（长时间运行，使用后台作业或子代理）：

```sh
cd /root/CODE/deepseek-harness && DSH_HOME=/root/CODE/.dsh pnpm dsh web --profile <name> --port 23008 --no-open > /tmp/dsh-web-23008.log 2>&1
```

3. 取得带 token 的地址。token 每次进程启动随机生成，不能固定。从日志中取出 `dsh web: <url>` 行：

```sh
grep -m1 '^dsh web: http' /tmp/dsh-web-23008.log | sed 's/^dsh web: //'
```

   - 输出为空：服务尚未就绪，等待数秒后重试；超过约 60 秒仍无输出，按第 6 节检查日志。
   - 用 `playwright-cli` 或其他浏览器工具访问时，必须使用这个完整 URL（含 `token` 参数）。
   - token 只存在于本次进程的日志中。不得写入 skill、迁移文档、changelog 或提交的文件。报告里只写端口与 HTTP 状态。服务重启后 token 会变化，需要重新读取日志。
4. HTTP 检查：`curl -s -o /dev/null -w '%{http_code}' "<带 token 的 URL>"` 应返回 200。
5. 阅读启动日志（`$DSH_HOME/logs/startup-*.log`，路径在启动输出末尾给出），重点看：
   - `Plugins waiting for services`：缺失的服务提供方，多半是插件被禁用或加载失败。
   - `ENOENT` 指向某个 `lib/` 文件：链接的包尚未构建。在对应检出目录执行 `pnpm run build:artifacts` 后重试。
   - `skippedBundles`：被跳过的 bundle 及原因。
6. 启动失败时先区分配置问题与代码问题：配置问题看 `--dump-config` 的结果；代码问题看日志中的错误路径与首行错误。
7. profile 依赖的版本尚未发布而导致启动失败是允许的：在报告中记为 **pending-release**，并说明缺失的版本，不视为本次 PR 失败。

## 6. 最小适配

只在检查发现不兼容且必须修改时才改动。

1. 修改只限于使其兼容所需的内容，不顺手调整无关设置。
2. **官方插件**：按第 3 节处理 changeset 与 profile 版本，不改插件源码。
3. **`dsh-plugins` 中的插件**：对照 DSH 源码（检出目录的对应包）检查插件用到的 API，修复不兼容处。修改后按 `dsh-plugins/AGENTS.md` 运行 `pnpm typecheck`、`pnpm lint`，有 `test` 脚本的插件再跑 `pnpm -C plugins/<name> test`。长命令交给 `workflow_runner` 子代理，并报告通过/失败结论。
4. **DSH home 配置**（`/root/CODE/.dsh`）：修改前用 `git status` 与 `git diff` 确认改动范围，不做 `git add -A`。
5. 修改后重新启动（第 5 节），直到启动成功、插件加载无误。
6. 每项配置调整写入 `$DSH_HOME/changelog/YYYY-MM-DD-<topic>.md`：修改的文件与键、修改前后的值（凭据只写变量名）、原因（插件版本或报错）、验证命令与结果。

## 7. 提交与 PR（自动执行）

调整完成后直接提交并开 PR，不需要用户授权。

1. `/root/CODE/dsh-plugins` 与 `/root/CODE/.dsh` 都不直接推送到默认分支，各自从默认分支新建分支（例如 `compat/dsh-<version>`），只添加本次改动的文件（不使用 `git add -A`），提交并推送该分支。`deepseek-harness` 的 `my_dev` 不适用本条。
2. 用 `gh pr create` 为每个仓库开 PR，描述包含：DSH 版本、插件结果（compatible / blocked）、启动验证结果。不要写 token 或凭据。
3. 无改动时不提交，也不开 PR，只在报告中说明。
4. 无法自动适配的插件（blocked）不阻止其他插件的 PR；在 PR 描述中列出，并为其开 issue。

## 7.1 本地测试时的 profile 安装

profile 依赖的新版本尚未发布时，允许 profile 启动失败。本地测试时：

1. 在 `$DSH_HOME/profiles/<name>/package.json` 中把待测插件的依赖写为文件路径，例如 `"@banzhe/dsh-git": "file:/root/CODE/dsh-plugins/plugins/git"`，然后重新 `pnpm install`（在 profile 目录）。
2. 验证通过后，把依赖改回预计发版的版本号（changeset 发布后的版本），再次验证。
3. 不要把 `file:` 路径提交到 PR；提交前确认 `package.json` 中不含 `file:`。

## 8. 报告

- 插件结果：每个插件 **compatible** 或 **blocked**，blocked 写明范围与目标版本。
- profile 结果：依赖、bundle、插件 id 的检查结论。
- 启动结果：端口 23008、HTTP 状态、关键日志行。
- 配置调整：文件与键，changelog 路径，PR 链接（若有）。
- 仍未解决的问题与下一步。
