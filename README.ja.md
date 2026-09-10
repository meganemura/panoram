# ⛰️ panoram

[English](README.md)

panoram は、開発者の機械 1 台の状態について答える。
どのコーディングエージェントがどこで動いているか、どのリポジトリが汚れているか、誰もいない worktree はどれか、止まっている session はどれか、リポジトリごとに有効なツールの版は何か。
panoram は自分のデータを持たない問い合わせ層である。
呼ばれるたびに provider をその瞬間に観測し、in-memory の SQLite で結合し、行を印字する。
第一の読み手はコーディングエージェントで、第二の読み手はその隣で働く人間である。

```sh
panoram in-dir --tsv
panoram agents-with-sessions
panoram --help
```

## なぜ panoram か

**道具をまたぐ問いに答える。**
herdr はどの pane でエージェントが動いているかを知り、git はどの checkout が汚れているかを知り、gh はどのブランチの check が落ちているかを知る。
しかし「check が落ちているブランチで作業中のエージェント」は、どの道具も 1 つでは答えられない。
panoram はそれらの記録をリポジトリの root という 1 つの鍵で結合するので、`failing-checks-with-agents`、`agents-in-dirty-repos`、`idle-worktrees`、`sessions-without-pane` はそれぞれ 1 クエリである。

**問いを出したエージェント自身のために答える。**
コマンドは呼び手の pane を環境から解決して結果から除く。
エージェントが自分のいるリポジトリで `panoram in-dir --tsv` を打てば、それは「他に誰がここにいるか」と読める。
エージェントが最初に読む文書は README ではなく skill である。

**答えは常に今であり、見えなかったものを言う。**
呼び出しごとに新しい in-memory データベースを作り、キャッシュを持たない。
封筒の `providers` 行が、そのクエリが触った provider ごとに `ok`、`observed_at`、エラーを運ぶ。
だから `ok` が 0 の隣の空の結果は「無い」ではなく「分からない」と読める。
session は検索せず観測する。
生きているプロセスだけを見て、transcript は末尾の 8 KB だけを読み、ギガバイト単位の履歴は読まない。

**問いは読む分だけ払う。**
文が読む表が、走る provider を決める。
`dirty` はエージェントのいるリポジトリで git を走らせ、それ以外は何もしない。
`review-requests` は GitHub の検索を 1 回だけ走らせ、`git status` は走らせない。
`--sql` の ad hoc な SQL も、`~/.config/panoram/queries/` に置いた自分の SQL ファイルも、同じ経路で解決され、`--help` に並ぶ。

**行の形は型であり、表は自分の問いのために文書化されている。**
provider はそれぞれ 1 つの solarsql module で、自分の表を所有する。
結合は report module だけが持つ。
build は列ごとの型を SQLite に問い、他の module の表に手を伸ばすクエリを拒む。
表と列は [tables.md](skills/panoram/references/tables.md) にあるので、新しい問いは panoram の変更ではなく SQL ファイル 1 つで足りる。

**panoram でないもの。**
ダッシュボードではない。
呼び出しごとに行を印字して終了する。
操作の道具ではない。
provider には書き込まず、状態を持つ道具が動詞を持つ。
履歴ではない。
過去の session、閉じた issue、merge 済みの pull request は他の道具の仕事である。

## 必要なもの

Node 24.10 以降。
build と ad hoc SQL の解決が node:sqlite の `setAuthorizer` を使う。
`PATH` に `herdr`、`git`、`ghq`、`mise`、`lsof`、`gh`(ログイン済み)、`bd`。
session の provider は `~/.claude` と `~/.codex` の記録を読む。
pane と session の結合には herdr の Claude Code と Codex の integration が要る。
無い provider は空の表になり、`providers` 行がそう言う。

## 導入

```sh
npm install -g panoram
panoram --help
```

checkout からなら `npm install && npm link` が同じことをする。
link しなくても `node cli.ts <query>` は動く。

この機械のエージェントに skill を渡す:

```sh
gh skill install meganemura/panoram panoram --scope user --agent claude-code
gh skill install meganemura/panoram panoram --scope user --agent codex
```

## 次に読むもの

使い方の文書は skill で、エージェントを第一の読み手として書いてある。
[skills/panoram/SKILL.md](skills/panoram/SKILL.md) が手順で、その references が規則を持つ。
プロジェクトの AGENTS.md からこの skill を指す。

| 目的 | 読むもの |
|---|---|
| クエリを選ぶ。リポジトリで動く前の手順 | [SKILL.md](skills/panoram/SKILL.md) |
| すべてのクエリと、そのパラメータと列 | [queries.md](skills/panoram/references/queries.md) |
| JSON の封筒、`providers`、フラグ、`me`、終了コード | [output.md](skills/panoram/references/output.md) |
| provider が埋める表。自分の文を書くために | [tables.md](skills/panoram/references/tables.md) |
| 名前付きクエリを SQL ファイル 1 つで足す | [user-queries.md](skills/panoram/references/user-queries.md) |

## 設計

設計の決定は [docs/](docs/README.md) に ADR として 1 決定 1 ファイルで置き、根拠にした測定を添えてある。
provider は自分の表を所有する solarsql module 1 つで、結合はすべて report module にある。

## ライセンス

MIT
