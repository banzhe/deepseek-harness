---
name: dsh-non-interactive-git-rebase
description: 在无法打开交互编辑器时，对非最顶层的 git commit 进行重排、拆分、丢弃、修订或改写元数据。通过 GIT_SEQUENCE_EDITOR 脚本化 rebase，覆盖提交拆分（自动选择 hunk）以及范围内任意 commit 的作者、message、日期修改。dsh-rebase-onto-master 的重放与历史改写必须使用本 skill 的方法。
---

# 非交互式 git rebase

本 skill 给出在脚本或无人值守环境中执行交互式 rebase 的方法。它只描述 git 操作；何时变基、基线如何选择、note 如何分类，见 [dsh-rebase-onto-master](../dsh-rebase-onto-master/SKILL.md)。

## 0. 硬性规则

1. **改写前必须创建备份分支**：

```sh
git branch backup-before-rebase-$(date +%Y%m%d-%H%M%S) HEAD
```

   备份分支在无人值守流程中**保留**，不自动删除。删除只在用户明确要求时进行。
2. **禁止在 todo 中使用 `reword`**：它会打开编辑器，无法脚本化。改用 `edit`，停下后用 `git commit --amend -m` 修改 message，再 `git rebase --continue`。
3. **禁止原始 `--force`**：推送改写后的分支只用 `--force-with-lease=<branch>:<observed-oid>`，并在推送前用 `git fetch` 记录远端 OID。
4. **不使用 `git rebase -i` 的默认编辑器**：所有 todo 必须通过 `GIT_SEQUENCE_EDITOR` 提供。
5. 改写完成后用备份分支核对内容（见第 5 节），不一致时停止，不推送。

## 1. 核心机制

`git rebase -i` 调用 `GIT_SEQUENCE_EDITOR` 编辑 todo 文件，其路径作为 `$1` 传入。任何覆盖该文件的命令都可以替代人工编辑：

```sh
GIT_SEQUENCE_EDITOR="cp /tmp/prepared-todo" git rebase -i <base>
```

### 生成默认 todo

```sh
GIT_SEQUENCE_EDITOR='cp $1 /tmp/default-todo && false' git rebase -i <base>
```

`false` 使 git 中止 rebase，因此只取出 todo，不发生改写。

或直接从 `git log` 生成：

```sh
git rev-list --reverse <base>..HEAD | while read hash; do
  echo "pick $hash $(git log --oneline -1 $hash | cut -d' ' -f2-)"
done > /tmp/prepared-todo
```

todo 中的 hash 在每次改写后都会变化，使用前必须从当前 `git log` 重新生成。

### 批量修改：`--exec`

`--exec <cmd>` 会在每个 `pick` 后插入一行 `exec <cmd>`。配合 `GIT_SEQUENCE_EDITOR=:`（不修改 todo 的空操作），即可在不打开编辑器的情况下对每个 commit 执行命令：

```sh
# 修正范围内所有 commit 的作者邮箱
GIT_SEQUENCE_EDITOR=: git rebase -i <base> --exec \
  'if [ "$(git log -1 --format=%ae)" != "correct@email.com" ]; then git commit --amend --no-edit --author="Name <correct@email.com>"; fi'
```

## 2. 操作

### 重排

在 todo 中调整 `pick` 行的顺序。例如把 `abc123` 移到最前：

```sh
{
  echo "pick abc123 $(git log --oneline -1 abc123 | cut -d' ' -f2-)"
  git rev-list --reverse <base>..HEAD | while read hash; do
    full=$(git rev-parse abc123)
    [ "$hash" != "$full" ] && echo "pick $hash $(git log --oneline -1 $hash | cut -d' ' -f2-)"
  done
} > /tmp/prepared-todo

GIT_SEQUENCE_EDITOR="cp /tmp/prepared-todo" git rebase -i <base>
```

### 丢弃

删除 todo 中对应的行，或把 `pick` 改为 `drop`。

### 修改 message

```sh
# 第 1 步：把目标 commit 的 pick 改为 edit
# 第 2 步：rebase 停止时，修改 message
git commit --amend -m "新标题

新正文。"
# 第 3 步：继续
git rebase --continue
```

### squash / fixup

`fixup` 保留前一个 commit 的 message；`squash` 会打开 message 编辑器，需要额外的 `GIT_EDITOR` 处理，因此优先使用 `fixup`。若必须 `squash` 并合并 message，先用 `GIT_EDITOR=true` 接受默认 message，再用 `git commit --amend -m` 写入最终 message。

### 拆分 commit

```sh
# 第 1 步：把目标改为 edit
sed 's/^pick TARGET_HASH/edit TARGET_HASH/' /tmp/default-todo > /tmp/prepared-todo
GIT_SEQUENCE_EDITOR="cp /tmp/prepared-todo" git rebase -i <base>

# 第 2 步：撤销该 commit，保留改动在工作区
git reset HEAD~1

# 第 3 步：分批暂存并提交
git add -p path/to/file        # 交互式选择 hunk
git commit -m "第一部分"
git add .
git commit -m "第二部分"

# 第 4 步：继续
git rebase --continue
```

#### 自动选择 hunk

`git add -p` 的 `y`/`n` 输入与 hunk 一一对应。hunk 之间相隔较远时可用 `printf` 脚本化：

```sh
printf 'n\nn\ny\n' | git add -p path/to/file
```

相邻的 hunk 可能被合并。此时先 `s`（拆分）再选择：

```sh
printf 's\ny\nn\ny\n' | git add -p path/to/file
```

hunk 边界不确定、或输出与预期不符时，改用补丁拆分：

```sh
git reset HEAD~1
git diff path/to/file > /tmp/full.patch
git checkout -- path/to/file
# 从 /tmp/full.patch 手工分出 /tmp/part1.patch
git apply --cached /tmp/part1.patch
git commit -m "第一部分"
git apply /tmp/part2.patch      # 剩余部分
git add path/to/file
git commit -m "第二部分"
```

`git apply --cached` 只暂存补丁内容，不改动工作区，避免第一步覆盖后面需要的改动。

## 3. 冲突处理

脚本化 rebase 遇到冲突时会停止：

1. 用 `git status` 查看冲突文件，按第 4 节的 note 规则决定采用哪一侧。
2. 解决后 `git add <file>` 再 `git rebase --continue`。
3. 无法判断时，`git rebase --abort` 回到备份分支，报告冲突文件与原因，不做猜测性解决。

## 4. 验证

改写完成后，用备份分支核对内容：

```sh
git diff backup-before-rebase-<时间戳> HEAD --stat
```

- 输出为空：内容完全一致（仅重排、message 或元数据修改时应如此）。
- 输出非空：这是预期的仅当你有意修改内容（拆分、丢弃、解决冲突）。逐文件检查差异，确认与意图一致。

另外确认 commit 数量：

```sh
git rev-list --count <base>..HEAD
```

## 5. 常见错误

| 错误 | 修复 |
|---|---|
| todo 中使用 `reword` | 改为 `edit`，停下后用 `git commit --amend -m` |
| 改写后仍使用旧 hash 的 todo | 从当前 `git log` 重新生成 |
| `git add -p` 的 hunk 与预期不符 | 改用补丁拆分（`git apply --cached`） |
| 备份分支过早删除 | 保留，删除需用户确认 |
| 推送时使用 `--force` | 改用 `--force-with-lease=<branch>:<observed-oid>` |

## 6. 速查

| 操作 | 命令 |
|---|---|
| 取出 todo | `GIT_SEQUENCE_EDITOR='cp $1 /tmp/default-todo && false' git rebase -i <base>` |
| 重排或丢弃 | `GIT_SEQUENCE_EDITOR="cp /tmp/prepared-todo" git rebase -i <base>` |
| 修改 message | todo 中 `edit`，停下后 `git commit --amend -m "..."`，再 `--continue` |
| 合并并保留 message | todo 中 `fixup` |
| 拆分 | todo 中 `edit`，`git reset HEAD~1`，分批 `git commit`，再 `--continue` |
| 批量修改 | `GIT_SEQUENCE_EDITOR=: git rebase -i <base> --exec '<cmd>'` |
