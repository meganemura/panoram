# Releasing

panoram stays on 0.x.0 versions for now. A release is three things: the npm package, a git tag, and the skill.

1. Move the `(unreleased)` entry of `CHANGELOG.md` to the version and the date. Set the same version in `package.json`.
2. `npm run check && npm test`.
3. `npm pack --dry-run` and read the file list: the source, `migrations/`, `skills/`, the READMEs, the changelog, the license, and nothing from `test/`.
4. Commit as `chore: release 0.x.0`, tag `v0.x.0`, push the branch and the tag.
5. `npm publish` (the owner runs it; `prepublishOnly` repeats the checks).
6. `gh skill publish --dry-run`, then `gh skill publish` to create the GitHub release for the skill. Run it in a checkout without `node_modules` (a fresh clone, or move the directory aside): the command scans the filesystem and would publish the solarsql skill from `node_modules` as well; agents install it with `gh skill install meganemura/panoram panoram --scope user --agent claude-code` (or `--agent codex`), and refresh with `gh skill update`.
7. On this machine, `npm link` again if the linked checkout moved, and `gh skill update` so the installed copies follow.
