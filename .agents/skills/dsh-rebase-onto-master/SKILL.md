---
name: dsh-rebase-onto-master
description: 将个人分支的本地工作变基到 origin/master 的已发布版本（默认）或指定的 master 提交，以应用合并上游的修改。过程包括选择基线、拉取最新的 my_dev、盘点分支上额外 commit 的 feature、判断基线是否已包含每个 feature、重放并解决冲突，最后把变基结果整理成 PR 描述并创建一个合入 my_dev 的 PR，不直接推送 my_dev，也不在仓库中留下 rebase 文档。当用户要求变基、合并上游、升级到新发布版本，或需要判断本地工作是否已进入基线时使用。
---

# 变基到上游版本

本 skill 只负责把本地工作应用到上游基线之上。

本 skill 面向个人分支。支持性规则以追加方式写在根目录 `AGENTS.md` 末尾的独立章节中。不要为了支持本 skill 而修改文档门禁、双语配对或 `.gitignore`。[历史策略](../../../AGENTS.md#conventions) 仍禁止原始 `--force`；堆叠 PR 交由 [dsh-merging-stacked-prs](../dsh-merging-stacked-prs/SKILL.md) 处理。

分支还携带一些无法通过 commit 重放的内容：DSH profile、快捷方式、环境变量、`PATH` 上的工具。这些内容整理成 PR 描述中的兼容性要求一节，随 PR 交付，不写入仓库文件。PR 描述只记录本分支相对基线额外的 commit 及其 feature 状态。

## 1. 选择基线

基线只能是**主题行精确等于** `release(dsh): <version>` 的那个 commit。`dsh-v<version>` tag 只存在于本地且不完整，只作参考，不作为依据。

`git log --grep` 不能用来选基线：它匹配整条 message，`^` 只锚定行首而不锚定主题行。实测在 `origin/master` 上：

| 解析方式 | 命中的 commit | 距真实 release | 重放冲突 |
|---|---|---|---|
| `git log -1 --grep='^release(dsh): '` | 一个 merge 提交，主题是 pull request 合并，正文另含 `release(dsh): sync … back to master` 一行 | 1411 个提交 | 8 个文件、9 个冲突块 |
| 同命令加 `--no-merges` | 一个「align master packages」的发布后对齐提交 | 非 release commit | 非 release commit |
| 主题行精确匹配 | 唯一那个 release commit | 0 | 0 |

错选的基线其 `package.json` 版本仍然正确，所以**版本断言抓不到这个错误**，只有匹配数断言能抓到。基线取错会把整段已发布的上游工作误当成需要重放的本地改动。

解析顺序：

1. 用户指定了版本（如 `0.1.5-rc.2`）：使用该版本。
2. 用户指定了 `master` 或 `origin/master`：基线为 `origin/master` 的最新提交，跳过发布查找。
3. 其他情况：`origin/master` 根 `package.json` 的版本。

```sh
git fetch origin master
version=$(git show origin/master:package.json | node -p "JSON.parse(require('node:fs').readFileSync(0,'utf8')).version")
matches=$(git log origin/master --no-merges --format='%H%x09%s' \
  | awk -F'\t' -v s="release(dsh): $version" '$2 == s { print $1 }')
count=$(printf '%s' "$matches" | grep -c . || true)
[ "$count" = 1 ] || {
  echo "基线: 期望恰好 1 个主题为 'release(dsh): $version' 的提交，实际 $count 个:"
  printf '%s\n' "$matches"
  exit 1
}
base=$matches
```

用户指定版本时把 `$version` 换成该版本，其余不变。

校验并报告：

```sh
git merge-base --is-ancestor "$base" origin/master
git show "$base:package.json" | node -p "JSON.parse(require('node:fs').readFileSync(0,'utf8')).version"
git log -1 --format='%h %ci %s' "$base"
```

以下情况停下来询问用户，不得猜测基线：匹配数不为 1；`base` 不是 `origin/master` 的祖先；`base` 的版本与 `$version` 不一致。

## 2. 前置检查

1. 确认检出位置与分支。若已有 merge 或 rebase 进行中，停止。当前分支必须是 `my_dev`。
2. 除 notes 外工作区必须干净。先 stash 或 commit 其他改动。
3. 变基前拉取最新的 `my_dev`。仅快进拉取，不做合并：

```sh
git fetch origin my_dev
git pull --ff-only origin my_dev
```

   快进失败时停止，报告本地与远端分叉的情况，询问用户如何处理。
4. 若分支属于官方 GitHub 堆叠，停止，改用 [dsh-merging-stacked-prs](../dsh-merging-stacked-prs/SKILL.md)。
5. 记录分支、`HEAD` 与分叉点：

```sh
git branch --show-current
git rev-parse HEAD
fork=$(git merge-base HEAD origin/master)
git rev-list --count "$fork..HEAD"
```

若 `$fork..HEAD` 为空，没有需要重放的本地工作：不改写历史，报告 `HEAD` 落后基线多少，并说明本次没有实际变基。

## 3. 盘点本地工作

读取 `notes/*.md`（除 `README.md`）。没有 note 的 commit 不要丢弃，也不要停机询问：在变基前按 [notes/README.md](notes/README.md) 的格式补一条 note 存根，再继续。

存根由 commit 自身推出，不猜意图：

```sh
git log --oneline --reverse "$fork..HEAD"
git show --stat --format='%h %s' <commit>
git show --diff-filter=D --name-only --format='' <commit>
```

- `Kind` 取 commit 主题的前缀（`feat`/`fix` 之外的 `docs`、`chore`、`ci`、`test` 按 `requirement` 处理）。
- `Status: local`。
- `Identifying paths` 取该 commit 触及的路径。
- `Unique strings or tests` 取主题中的函数名、常量名或测试名；没有时取主题本身。
- `## Intent` 抄 commit 主题，并标注「存根：由 commit 推导，未经作者确认」。
- `## Already-on-master test` 写成在 `$base` 上搜索上述唯一字符串或路径。

存根在变基完成后与其他 note 一起提交，提交信息里列出补了几条、分别对应哪个 commit 主题。

注意：上一轮曾因 7 个 commit 缺 note 而整条变基链阻塞。补存根的成本远低于停机等待。

用路径、唯一字符串和意图把 commit 与已有 note 对应起来。

## 4. 总结分支的额外 commit

变基会替换所有 commit id，因此在改写前先总结。只关注 `"$fork..HEAD"` 中的 commit：这是本分支相对基线额外带来的全部工作。不要用 `"$base..HEAD"`，它还包含发布版与分叉点之间落地的 master 提交。

```sh
git log --oneline --reverse "$fork..HEAD"
git diff --stat "$fork..HEAD"
git diff --diff-filter=D --name-only "$fork..HEAD"
git diff "$fork..HEAD" -- '*/package.json' pnpm-lock.yaml tsconfig.base.json tsconfig.host.json
```

对每个额外 commit（或每个 feature），记录：

1. **Feature**：commit 标题与其 message 所述的意图。
2. **行为**：拉取后用户或模型会观察到的差异。
3. **面向机器的接口**：脚本、`package.json` 与 lockfile、`tsconfig` 引用、固定 URL 的资源。
4. **验证**：覆盖该 feature 的测试与门禁。

## 5. 整理 PR 描述草稿

变基前先起草 PR 描述，变基后按第 8 节发布。草稿只存在于会话中，不写入仓库：不要在 `my_dev` 上新增任何记录本次变基的文件。

草稿包含四节：

1. **额外 commit 与 feature**：第 4 节列出的每项一行，状态列在第 6 节分类后填写。
2. **兼容性要求**：另一台机器必须满足的要求（工具、环境变量名、profile 步骤、快捷方式）。本机的检查与适配由 [dsh-compatibility-check](../dsh-compatibility-check/SKILL.md) 完成，写入此处时只保留要求，不写本机路径、版本或凭据位置。
3. **分类结果**：每条 note 的 landed、not-landed、post-release 或 uncertain 结论，uncertain 必须标注。
4. **验证**：变基后运行的命令与结果。

约束：

- 只记录第 4 节列出的额外 commit 与 feature，不记录基线或已落地的工作。
- 不写 commit hash，用 commit 标题和路径标识 feature。commit hash 在变基后全部失效。
- 凭据只写名称，不写值。
- 不写 token、cookie 或任何进程级密钥。
- 不要编辑另一台机器的 DSH home；把步骤写进描述。

## 6. 判断基线是否已包含工作

对每条 `Status: local` 的 note，使用其 **Already-on-master 测试**，在 `"$base"` 上搜索（不是 `origin/master`）：

```sh
git grep -n -F -- <unique-string> "$base" -- <path>
git log "$base" -- <path>
```

分类：

- **landed**：基线已实现该意图，即使写法不同。
- **not-landed**：基线中不存在。
- **post-release**：基线中不存在，但 `origin/master` 已有。报告并询问是否以 `origin/master` 为目标。
- **uncertain**：结论不确定。不要丢弃该工作，按 not-landed 的方式保留本地意图重放，并在 PR 描述中明确标注该 note 的结果为 uncertain。

分类结果写入 PR 描述草稿。全部 note 都已分类之后再开始变基。

## 7. 重放到基线

重放与任何历史改写（重排、拆分、修改 message 或作者）必须使用 [dsh-non-interactive-git-rebase](../dsh-non-interactive-git-rebase/SKILL.md) 的方法，包括先创建备份分支。

```sh
git branch backup-before-rebase-$(date +%Y%m%d-%H%M%S) HEAD
git rebase --empty=drop --onto "$base" "$fork"
```

冲突时，先确定对应 commit 与 note：

- **landed**：对该 note 的路径采用基线一侧（变基期间为 `ours`）。若 commit 无剩余差异，`git rebase --skip`；否则暂存基线版本并 `git rebase --continue`。
- **not-landed** 或 **uncertain**：保留本地意图并解决冲突，不盲目采用基线。uncertain 的解决结果需在 PR 描述中标注。
- **无 note**：先按第 3 节补存根，再按 not-landed 处理。

无人值守运行时，冲突按第 7.1 节的闸门处理；超过闸门即停止并保持变基进行中，不要凭猜测解决。

用户取消时用 `git rebase --abort`，不留混合状态的工作树。不使用原始 `--force`。

### 7.1 无人值守的冲突闸门

把冲突分成两类，只让机械类继续自动重放。

**机械可解**（允许自动解决，解决后必须运行受影响包的测试）：

- 同一文件两侧改动落在不同行域。
- 二进制资源（`*.png`、`*.ico`、`*.woff*`）两侧都新增：保留本地一份，并在 PR 描述记录「上游另有同名资源，已保留本地版本」。
- `package.json` 只差版本号或依赖条目：逐条合并，本地版本优先用于本地依赖。
- lockfile：不要手改，冲突后对受影响目录重跑 `pnpm install`。

**必须停机**（不自动解决，保持变基进行中并报告）：

- 同一段代码双方都改了逻辑。
- 冲突落在 `AGENTS.md`、`docs/**`、`scripts/**` 中描述门禁或策略的段落。
- 冲突块数超过 10，或同一 commit 连续两次 `--continue` 失败。
- 任何涉及凭据、签名、发布工作流（`.github/workflows/**`）的冲突。

停机时报告：commit 主题、文件路径、冲突块数、两侧各自的意图，以及建议的两条解法。不要写状态文件，下次运行从同一处继续。

自动解决后逐 commit 验证，不要只在末尾验证一次：

```sh
pnpm exec vitest run <受影响包的测试> --run
```

## 8. 变基之后

先执行第 9 节的本机构建与检查，通过后再按本节提交、推送并开 PR。

1. 归类为 landed 的 note 删除，或设为 `Status: landed`。
2. 仍描述 `"$base..HEAD"` 中 commit 的 note 保持 `Status: local`。
3. 把 landed 的 feature 从 PR 描述草稿的表格中删去或标注为 landed，保留 uncertain 的标注，并填写第 9 节得到的构建与检查结果。
4. 在变基结果上创建交付分支，再把 note 状态的更新提交上去，不提交任何本次变基的记录文件：

```sh
branch="rebase/my-dev-onto-<base-version>"
git switch -c "$branch"
git add .agents/skills/dsh-rebase-onto-master/notes/
git commit -m "docs(notes): 更新 my_dev 变基到 <base-version> 后的 note 状态"
```

   提交信息与内容不写 commit hash。若变基后还有其他需要提交的文件，一并纳入。没有需要提交的文件时跳过 `git add` 与 `git commit`，分支本身仍要创建。本地 `my_dev` 保持在变基结果上，不要重置它。

5. 推送前用 [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) 选择检查项。推送**交付分支**，不推送 `my_dev`：

```sh
git push -u origin "$branch"
```

6. 用 PR 交付，基分支为 `my_dev`：

```sh
gh pr create --base my_dev --head "$branch" \
  --title "rebase: my_dev onto <base-version>" \
  --body-file <PR 描述草稿路径>
```

   PR 描述即第 5 节的草稿，包含额外 commit 与 feature、兼容性要求、分类结果、验证四节，以及另一台机器要执行的步骤。token、cookie 与凭据值不得写入。

   变基改写了 commit id，交付分支与 `my_dev` 必然分叉，所以 PR 的差异是 `merge-base(my_dev, $branch)` 到交付分支，即本次变基后的全部 commit。审阅时看到的是变基结果，不是与 `my_dev` 的增量。`gh pr create` 报 `No commits between` 时停止，报告该错误与两侧的 commit 数，不要改基分支重试。

7. 不推送到 `master`，不向 DSH 官方上游提交，不直接推送 `my_dev`。
8. PR 合并后再同步本地 `my_dev`：

```sh
git fetch origin my_dev
git switch my_dev && git reset --hard origin/my_dev
```

   合并前本地 `my_dev` 仍停在变基结果上，与 `origin/my_dev` 分叉，这是本流程的正常中间状态。不要用推送 `my_dev` 的方式消除该分叉。

## 9. 本机构建

变基不刷新构建产物：

```sh
pnpm install   # 仅当重放涉及 pnpm-lock.yaml、package.json 或 workspace 清单
pnpm run build
```

任一命令失败即停止并报告失败的包与首行错误。不要为消除失败而修改无关源码。若失败涉及基线已删除的包，先 `pnpm run clean` 再重建。构建通过后回到第 8 节完成提交、推送与开 PR。

门禁命令的固定配置（不要用默认值，实测默认堆会导致误判）：

```sh
NODE_OPTIONS=--max-old-space-size=8192 pnpm run doc-sync
```

`verify-doc-graphs`（即 `tsx scripts/gen-doc-graphs.ts --check`）在默认堆下会 OOM 并表现为门禁失败；给到 8 GB 后约 76 秒通过。OOM 不是代码问题，不得据此修改源码或门禁。

## 10. 已知上游既有失败

有些门禁在任何基线上都失败，与本分支无关。命中这些指纹时不阻塞，但必须在报告中列出：

```sh
pnpm exec tsx scripts/verify-repository-references.ts
```

- `python/sdk/uv.lock:<line> commit-hash`：已在 `release(dsh): 0.2.1-rc.3`、其后的 master 提交、以及 `origin/master` 最新提交上复现，属上游既有失败。

判断新失败是否属于「既有」的唯一方法是**在基线 commit 的干净 worktree 上复现**，不要凭经验假设：

```sh
git worktree add --detach /tmp/wt-base "$base"
cd /tmp/wt-base && ln -s <本仓>/node_modules node_modules && <同一命令>
git worktree remove --force /tmp/wt-base
```

只在基线同样失败时才记为既有，并把指纹（命令 + 首行错误）追加到本节。

## 11. 插件与配置检查

变基完成后（包括空变基），运行 [dsh-compatibility-check](../dsh-compatibility-check/SKILL.md)，检查 `/root/CODE/dsh-plugins` 的版本范围，以及 `/root/CODE/.dsh` 下的 profile 启动结果。本 skill 不再重复其步骤。

## 12. 报告

- 使用的版本与基线，以及基线解析的匹配数（必须为 1）。
- 每条 note 的分类结果（landed、not-landed、post-release、uncertain），uncertain 项明确标注；补写的存根单独列出。
- 被跳过或丢弃的 commit。
- 自动解决的冲突清单（文件、块数、解决方式），以及停机未解决的冲突（若有）。
- 交付分支名、PR 链接，以及 PR 描述包含的四节。
- 构建结果与所运行的命令，以及命中的既有上游失败。
- 说明：变基到某个版本后，`"$base..origin/master"` 的 commit 暂不在分支上，要到下一次变基到 `master` 或更新版本时才会回归。
- 说明：`my_dev` 在 PR 合并前保持未推送状态，本地与 `origin/my_dev` 分叉属正常。
- 剩余的本地 note。
- 插件与配置兼容性检查的结论（见 dsh-compatibility-check 的报告）。
