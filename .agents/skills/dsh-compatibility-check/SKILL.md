---
name: dsh-compatibility-check
description: 检查 DSH 配置与插件是否与当前版本兼容。以 deepseek-harness 的 my_dev 版本为目标，先拉取 /root/CODE/dsh-plugins 与 DSH home 配置的最新提交，以插件源码对照 DSH 版本间的 API 差异为主要依据，peerDependencies 声明仅作参考，并核对 profile 依赖，再从 DSH home 启动 dsh web（端口 23008）检查加载错误。官方插件按 changeset 升版本，dsh-plugins 中的插件若不兼容则做适配。适配完成后提交配置与插件并创建 PR。当升级 DSH 版本、变基之后、修改插件或 profile 配置，或用户要求检查兼容性时使用。
---

# 检查配置与插件的兼容性

本 skill 检查四件事：插件源码使用的 DSH API 在目标版本中是否仍然存在且兼容（**以源码为准**）、插件的 peer 版本范围声明、profile 的依赖与配置、启动后的实际加载结果。peer 范围只是声明，不能代替源码检查。变基本身的流程见 [dsh-rebase-onto-master](../dsh-rebase-onto-master/SKILL.md)。

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

## 2. 插件声明的版本范围（不可信，仅供参考）

插件的 `version` 与 DSH 版本无关，由 changesets 独立管理。插件 `package.json` 中 `peerDependencies` 的 `@deepseek-ai/*` 范围是未经验证的声明，不能作为兼容性依据。检查的目的就是判断兼容性，结论只能来自第 2.1 节的源码检查。

1. 列出每个插件的 peer 范围（用绝对路径，避免相对路径解析失败）：

```sh
for f in /root/CODE/dsh-plugins/plugins/*/package.json; do
  node -e 'const p=require(process.argv[1]);
    const peers=Object.entries(p.peerDependencies??{}).filter(([k])=>k.startsWith("@deepseek-ai/")).map(([k,v])=>k+"@"+v).join(" ");
    console.log(p.name, "version="+p.version, "engines.dsh="+(p.engines?.dsh??"-"), peers||"-")' "$f"
done
```

2. 用 semver 判断范围是否包含目标版本，结果仅供参考，不决定结论。在 DSH 检出目录运行，以复用其 `node_modules`：

```sh
cd /root/CODE/deepseek-harness && node -e "console.log(require('semver').satisfies('<version>', '<range>'))"
```

prerelease 规则：`^0.2.1-alpha.2` 会匹配 `0.2.1-rc.2`。

3. 插件是否 blocked 只由第 2.1 节的源码核对决定，与 semver 结果无关。blocked 时写出不兼容的 `文件:行` 与符号。
4. 修改 peer 范围只能在源码核对确认真实兼容范围之后，并且与适配改动同一次完成（依据 `dsh-plugins/AGENTS.md`）。不得因为 DSH 发布了新版本就机械地提升 peer 范围。
5. 有 `engines.dsh` 时才检查它；当前插件都没有该字段，缺失不算错误。

## 2.1 源码级 API 检查（必做）

插件是否兼容，必须由插件源码与 DSH 源码的对照结果决定。未完成本节核对的插件，不得标记为 compatible。

1. **确定 API 变化集合**：以上次已验证的 DSH 版本（如 `0.2.1-rc.2`）为旧基线，目标版本为新版本，在检出目录比较两个 tag 或 commit 的公开面：
   ```sh
   cd /root/CODE/deepseek-harness && git diff <old>..<new> -- 'packages/**/src/**' 'packages/**/package.json'
   ```
   实际布局为 `packages/<group>/<pkg>/src`，路径必须用 `packages/**/src/**` 匹配。
   基线 commit 用 `git log --grep '^release(dsh): <old>$'` 定位（版本可能没有 tag）。
   记录删除或重命名的导出、签名变化、服务名、事件 map、配置字段的变化，作为变化集合。
2. **枚举插件的依赖面**：对每个插件 `src/` 目录（不含测试），收集从 `@deepseek-ai/*` 的 import、`ctx.*` 服务访问、`ctx.on` / `ctx.effect` 的事件名，以及 `cordis.yml` 中的配置键：
   ```sh
   grep -rnE "from ['\"]@deepseek-ai/|ctx\.(get|on|effect|inject|service)\(" /root/CODE/dsh-plugins/plugins/*/src
   ```
3. **逐项核对**：每个被引用的符号、服务名、事件名与配置键，必须在目标版本源码中存在且调用方式兼容。落入变化集合的项，逐一核对其调用点与新签名。
4. **辅助证据**：插件目录通常没有 `node_modules`，`pnpm typecheck` 不能直接运行。二选一：
   - 先在插件目录安装依赖（按第 7.2 节对齐 DSH 包到目标版本），运行 `pnpm typecheck`，验证后恢复依赖，不提交 `file:` 路径；
   - 或用生成的 tsconfig 把 `@deepseek-ai/*` 映射到目标版本的 `packages/**/src`，直接编译插件 `src`。
   只有解析到的 DSH 包为目标版本时，结果才可作为证据。
5. **结论**：每个插件输出 **compatible**（所有引用项已核对且兼容，列出核对的符号数）或 **blocked**（列出不兼容的 `文件:行` 与符号）。
6. 声明与源码冲突时以源码为准：声明范围包含目标版本但源码核对失败，记为 blocked；声明范围不包含目标版本但源码核对通过，记为 compatible，并在报告中指出声明需要同步。
7. 只有源码核对发现的不兼容项才进入第 6 节适配。peer 范围在适配完成后再按真实兼容范围同步，不得在核对之前提升。

## 3. 插件版本与 changeset（仅官方插件升级时）

1. 插件版本由 changesets 管理。**不要手改 `version` 或 `CHANGELOG.md`**。
2. 需要发布的插件，在插件仓库执行 `pnpm changeset` 生成 changeset 文件，然后提交该文件。
3. profile 的依赖版本（`$DSH_HOME/profiles/<name>/package.json` 中的 `@banzhe/*`）必须与插件 `package.json` 的 `version` 一致。版本变化后同步改 profile 中对应的条目。

## 4. profile 与配置

1. **依赖与 bundle**：读取 `profiles/<name>/package.json`，核对 `dependencies` 的版本是否与插件当前 `version` 一致，以及 `dsh.profile.bundles` 中的每一项是否能解析。

   **两个 profile 都必须 `pnpm install`**，不能只装 web。`package.json` 改了版本而 lockfile 与 `node_modules` 没重装时，实际运行的仍是旧版本，静态检查不会发现：

```sh
for p in web desktop; do
  (cd "/root/CODE/.dsh/profiles/$p" && pnpm install)
done
```

   装完断言实际解析到的版本，而不是只看声明：

```sh
for p in web desktop; do
  echo "== $p =="
  (cd "/root/CODE/.dsh/profiles/$p" && pnpm list --depth 0 2>/dev/null | grep -E '@deepseek-ai/dsh-(computer-use|mcp-client)')
done
```

   已知副作用：`pnpm install` 会重写 `profiles/<name>/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`，把目标版本追加进去。这是 pnpm 的正常行为，与 web 保持一致即可提交。

2. **组合结果**：

```sh
cd /root/CODE/deepseek-harness && DSH_HOME=/root/CODE/.dsh pnpm dsh web --dump-config
```

`pnpm dsh web` 已默认选择 profile，不要再传 `--profile`，否则报 `select a profile only once`。

3. **desktop 配置（必做，静态检查）**：`desktop` 与 `web` 两个 profile 都必须检查，不能只查 web。
   - CLI 拒绝 `desktop`（`apps/cli/src/args.ts` 的 `rejectElectronProfile`，报 `managed exclusively by the Electron application`），因此 `--dump-config` 对 desktop 不可用，也不得为此启动 desktop 应用。
   - 对 `profiles/desktop` 做静态核对：
     - `dependencies` 与 `profiles/web/package.json` 的插件依赖逐项比对，版本需一致（如 DSH 包锁定到目标版本）。
     - `dsh.profile.bundles` 中每一项在依赖中可解析。
     - `cordis.patch.yml` 中每个插件 id 在 desktop 的组合基础（`dsh-base` + `dsh-web-app`）中存在，且未被 `disabled: true` 误禁用。
     - 与 web 的 `cordis.patch.yml` 的差异逐条说明，判断是否为有意的 desktop 差异（模型、视图、额外插件等）。
   - 结论分别写入报告的 web 与 desktop 两栏。
4. **组合结果（web）**：`DSH_HOME=/root/CODE/.dsh pnpm dsh web --dump-config` 退出码为 0，且无不兼容或禁用插件的输出。`disabled: true` 与平台条件是正常配置，不是加载错误。
5. **残留 id（web 与 desktop 都检查）**：`cordis.patch.yml` 中的插件 id 若在组合结果中不存在，记为 blocked。

6. **凭据与设置**：只检查变量名或键名，不读取、不复制、不记录值（例如 `.credentials.yaml` 的 refs 段）。

## 5. 启动验证（仅 web，端口 23008）

只启动 web。desktop 不需要启动，它的检查已在第 4 节静态完成。

1. 确认端口空闲：`ss -ltn | grep ':23008 '`。若已占用，报告占用进程，不要抢占。
2. 启动前先构建产物。链接的包（如 `ui-deepseek-model-label-1017`）缺少 `lib/client.js` 时，`client-hmr` 启动失败：

```sh
cd /root/CODE/deepseek-harness && pnpm run build:artifacts
```

   构建长时间运行，交给 `workflow_runner` 子代理执行，并核对 `packages/client/ui-deepseek-model-label-1017/lib/client.js` 存在。
3. 启动，把 stdout 与 stderr 写入日志（长时间运行，使用后台作业或子代理）：

```sh
cd /root/CODE/deepseek-harness && DSH_HOME=/root/CODE/.dsh pnpm dsh web --port 23008 --no-open > /tmp/dsh-web-23008.log 2>&1
```

4. 取得带 token 的地址。token 每次进程启动随机生成，不能固定。从日志中取出 `dsh web: <url>` 行：

```sh
grep -m1 '^dsh web: http' /tmp/dsh-web-23008.log | sed 's/^dsh web: //'
```

   - 输出为空：服务尚未就绪，等待数秒后重试；超过约 60 秒仍无输出，按第 6 节检查日志。
   - 用 `playwright-cli` 或其他浏览器工具访问时，必须使用这个完整 URL（含 `token` 参数）。
   - token 只存在于本次进程的日志中。不得写入 skill、PR 描述、changelog 或提交的文件。报告里只写端口与 HTTP 状态。服务重启后 token 会变化，需要重新读取日志。
5. HTTP 检查分两步，不能只用带 token 的地址直接判断 200。带 token 的地址先返回 303 并设置 HttpOnly 鉴权 cookie；携带该 cookie 访问根路径才返回 200：

```sh
url=$(grep -m1 '^dsh web: http' /tmp/dsh-web-23008.log | sed 's/^dsh web: //')
jar=$(mktemp)
curl -s -o /dev/null -w 'token step: %{http_code}\n' -c "$jar" "$url"        # 期望 303
curl -s -o /dev/null -w 'cookie step: %{http_code}\n' -b "$jar" http://127.0.0.1:23008/   # 期望 200
rm -f "$jar"
```

   不带 token 且无 cookie 访问应返回 401，用来确认鉴权生效。报告中只写状态码，不打印 token 或 cookie。
6. 阅读启动日志（`$DSH_HOME/logs/startup-*.log`，路径在启动输出末尾给出），重点看：
   - `Plugins waiting for services`：缺失的服务提供方，多半是插件被禁用或加载失败。
   - `ENOENT` 指向某个 `lib/` 文件：链接的包尚未构建，回到第 2 步执行 `pnpm run build:artifacts`。
   - `skippedBundles`：被跳过的 bundle 及原因。
   - 启动成功时日志中不应出现以上任何一项；注意区分旧日志与本次启动的日志。
7. 启动失败时先区分配置问题与代码问题：配置问题看 `--dump-config` 的结果；代码问题看日志中的错误路径与首行错误。
8. profile 依赖的版本尚未发布而导致启动失败是允许的：在报告中记为 **pending-release**，并说明缺失的版本，不视为本次 PR 失败。

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

### 7.1 合并后校验（必做）

三个仓库的 `allow_auto_merge` 均为 `false`，自动化不能自己合并。合并由人完成，所以**下一次运行时必须先校验上一轮 PR 是否完整落地**，因为「PR 显示 MERGED」不等于「内容都在默认分支上」。

上一轮 PR #1 已合并，但 desktop 锁文件修复不在其中，导致 `main` 上的 desktop 仍指向旧版本，且整轮检查报的是成功。这就是本节的由来。

每次运行开始时，对上一轮已知的 PR 做一次核对：

```sh
# 1. PR 状态与合并时间
gh pr view <n> --json number,state,mergedAt,headRefName

# 2. 关键文件在默认分支上的实际内容（不是看 PR diff）
git fetch origin <default-branch>
git show origin/<default-branch>:<changed-path> | grep -n '<expected-version>'
```

判据：

- PR 为 `OPEN`：在报告中提示待合并，不重复开 PR，不要基于未合并的分支继续改动。
- PR 为 `MERGED` 但 `git show` 显示关键文件仍是旧值：**记为未落地**，从当前默认分支重新开一个只含缺失改动的 PR，并在描述里链接原 PR 说明原因。不要 force-push 或重开原分支。
- PR 为 `CLOSED` 未合并：同「未落地」。
- 分支已被删除且内容已落地：正常，无需处理。

校验必须查默认分支的实际内容，不能只查 PR 的 `state` 或 diff。合并可能被 squash、可能只合并了部分提交，`state: MERGED` 对内容没有任何保证。

## 7.2 本地测试时的 profile 安装

profile 依赖的新版本尚未发布时，允许 profile 启动失败。本地测试时：

1. 在 `$DSH_HOME/profiles/<name>/package.json` 中把待测插件的依赖写为文件路径，例如 `"@banzhe/dsh-git": "file:/root/CODE/dsh-plugins/plugins/git"`，然后重新 `pnpm install`（在 profile 目录）。
2. 验证通过后，把依赖改回预计发版的版本号（changeset 发布后的版本），再次验证。
3. 不要把 `file:` 路径提交到 PR；提交前确认 `package.json` 中不含 `file:`。

## 8. 报告

- **上一轮 PR 的落地校验**：每个 PR 的状态，以及关键文件在默认分支上的实际值（已落地 / 未落地 / 待合并）。
- 插件结果：每个插件 **compatible** 或 **blocked**，结论必须来自第 2.1 节的源码核对。报告每个插件核对的符号数、变化集合命中项，以及 blocked 的 `文件:行` 与符号；声明的 peer 范围可附带列出，但不作为依据。
- profile 结果：web 与 desktop **分别**列出依赖、bundle、插件 id 的检查结论，`pnpm install` 后实际解析到的版本，以及 `cordis.patch.yml` 中 desktop 与 web 的差异说明。
- 启动结果：仅 web，端口 23008、HTTP 状态、关键日志行；desktop 注明"仅静态检查，未启动"。
- 配置调整：文件与键，changelog 路径，PR 链接（若有）。
- 仍未解决的问题与下一步。
