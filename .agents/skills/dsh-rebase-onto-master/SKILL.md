---
name: dsh-rebase-onto-master
description: 将个人分支的本地工作变基到 origin/master 的已发布版本（默认）或指定的 master 提交，以应用合并上游的修改。过程包括选择基线、拉取最新的 my_dev、盘点分支上额外 commit 的 feature、判断基线是否已包含每个 feature、重放并解决冲突、写入受版本控制的 rebase 文档，并在完成后提交该文档与其他修改。当用户要求变基、合并上游、升级到新发布版本，或需要判断本地工作是否已进入基线时使用。
---

# 变基到上游版本

本 skill 只负责把本地工作应用到上游基线之上。

本 skill 面向个人分支。支持性规则以追加方式写在根目录 `AGENTS.md` 末尾的独立章节中。不要为了支持本 skill 而修改文档门禁、双语配对或 `.gitignore`。[历史策略](../../../AGENTS.md#conventions) 仍禁止原始 `--force`；堆叠 PR 交由 [dsh-merging-stacked-prs](../dsh-merging-stacked-prs/SKILL.md) 处理。

分支还携带一些无法通过 commit 重放的内容：DSH profile、快捷方式、环境变量、`PATH` 上的工具。变基前要把它们记录到 [rebase/](rebase/README.md) 下受版本控制的文档中，使另一台机器能够迁移。该文档只记录本分支相对基线额外的 commit 及其 feature 状态。

## 1. 选择基线

默认基线是 `origin/master` 上最新的 release commit。每个 dsh 发布都以包含 `release(dsh): <version>` 的 commit 进入 `master`，其 `package.json` 带有该版本号。`dsh-v<version>` tag 只存在于本地且不完整，只作参考，不作为依据。

解析顺序：

1. 用户指定了版本（如 `0.1.5-rc.2`）：使用该版本。
2. 用户指定了 `master` 或 `origin/master`：基线为 `origin/master` 的最新提交，跳过发布查找。
3. 其他情况：最新的 release commit。

```sh
git fetch origin master
base=$(git log origin/master -1 --format='%H' --grep='^release(dsh): ')
```

指定版本时：

```sh
version='0.1.5-rc.2'
base=$(git rev-parse --verify --quiet "refs/tags/dsh-v$version")
[ -n "$base" ] || base=$(git log origin/master -1 --format='%H' --grep="^release(dsh): $version")
```

确认并报告基线版本：

```sh
git show "$base:package.json" | node -p "JSON.parse(require('node:fs').readFileSync(0,'utf8')).version"
git log -1 --format='%h %ci %s' "$base"
```

以下情况停下来询问用户：任一命令无输出；版本与用户指定的不一致；`base` 不是 `origin/master` 的祖先。

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

读取 `notes/*.md`（除 `README.md`）。若某个本地 commit 没有对应 note，在变基前补写（见 dsh-feature-or-fix 的第 2 节）。没有 note 的 commit 属于不确定项，不要丢弃。

```sh
git log --oneline --reverse "$fork..HEAD"
```

用路径、唯一字符串和意图把 commit 与 note 对应起来。

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

## 5. 记录机器状态（rebase 文档）

变基前，从 [rebase/README.md](rebase/README.md) 创建 `rebase/YYYY-MM-DD-<branch-slug>-onto-<base-version>.md`。

- 只记录第 4 节列出的额外 commit 与 feature，不记录基线或已落地的工作。
- 「Extra commits and features」表格中的每一行即一个 feature，状态列在第 6 节分类后填写。
- 兼容性要求一节只记录另一台机器必须满足的要求（工具、环境变量名、profile 步骤、快捷方式）。本机的检查与适配由 [dsh-compatibility-check](../dsh-compatibility-check/SKILL.md) 完成，检查结果写入此处时只保留要求，不写本机路径、版本或凭据位置。
- 文档必须受版本控制，不能写入 gitignore 路径。
- 不写 commit hash，用 commit 标题和路径标识 feature。
- 凭据只写名称，不写值。
- 不要编辑另一台机器的 DSH home；把步骤写进文档。

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
- **uncertain**：结论不确定。不要丢弃该工作，按 not-landed 的方式保留本地意图重放，并在迁移文档中明确标注该 note 的结果为 uncertain。

分类结果写入迁移文档。全部 note 都已分类之后再开始变基。

## 7. 重放到基线

重放与任何历史改写（重排、拆分、修改 message 或作者）必须使用 [dsh-non-interactive-git-rebase](../dsh-non-interactive-git-rebase/SKILL.md) 的方法，包括先创建备份分支。

```sh
git branch backup-before-rebase-$(date +%Y%m%d-%H%M%S) HEAD
git rebase --empty=drop --onto "$base" "$fork"
```

冲突时，先确定对应 commit 与 note：

- **landed**：对该 note 的路径采用基线一侧（变基期间为 `ours`）。若 commit 无剩余差异，`git rebase --skip`；否则暂存基线版本并 `git rebase --continue`。
- **not-landed** 或 **uncertain**：保留本地意图并解决冲突，不盲目采用基线。uncertain 的解决结果需在迁移文档中标注。
- **无 note**：停止，保持变基进行中，询问用户。

用户取消时用 `git rebase --abort`，不留混合状态的工作树。不使用原始 `--force`。

## 8. 变基之后

1. 归类为 landed 的 note 删除，或设为 `Status: landed`。
2. 仍描述 `"$base..HEAD"` 中 commit 的 note 保持 `Status: local`。
3. rebase 文档中设置 `Rebased on:`，把 landed 的 feature 从表格中删去或标注为 landed，保留 uncertain 的标注。
4. 构建与检查通过后，提交 rebase 文档和其他修改（包括 note 状态的更新）到 `my_dev`：

```sh
git add rebase/ .agents/skills/dsh-rebase-onto-master/notes/
git commit -m "docs(rebase): 记录 my_dev 变基到 <base-version> 的 rebase 文档"
```

   提交信息与内容不写 commit hash。若变基后还有其他需要提交的文件，一并纳入。
5. 推送前用 [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) 选择检查项。`my_dev` 直接推送，不开 PR。推送时使用精确 lease，不使用原始 `--force`：

```sh
git fetch origin my_dev
git push --force-with-lease=my_dev:<observed-oid> origin my_dev
```

6. 不推送到 `master`，不向 DSH 官方上游提交。

## 9. 本机构建

变基不刷新构建产物：

```sh
pnpm install   # 仅当重放涉及 pnpm-lock.yaml、package.json 或 workspace 清单
pnpm run build
```

任一命令失败即停止并报告失败的包与首行错误。不要为消除失败而修改无关源码。若失败涉及基线已删除的包，先 `pnpm run clean` 再重建。构建通过后再执行第 8 节的提交。

## 10. 插件与配置检查

变基完成后（包括空变基），运行 [dsh-compatibility-check](../dsh-compatibility-check/SKILL.md)，检查 `/root/CODE/dsh-plugins` 的版本范围，以及 `/root/CODE/.dsh` 下的 profile 启动结果。本 skill 不再重复其步骤。

## 11. 报告

- 使用的版本与基线，新的 `HEAD`。
- 每条 note 的分类结果（landed、not-landed、post-release、uncertain），uncertain 项明确标注。
- 被跳过或丢弃的 commit。
- rebase 文档路径，以及提交的 commit 标题。
- 构建结果与所运行的命令。
- 说明：变基到某个版本后，`"$base..origin/master"` 的 commit 暂不在分支上，要到下一次变基到 `master` 或更新版本时才会回归。
- 剩余的本地 note。
- 插件与配置兼容性检查的结论（见 dsh-compatibility-check 的报告）。
