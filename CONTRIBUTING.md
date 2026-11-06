# Contributing to SangeetPremi

Thanks for your interest in SangeetPremi (created by SPOOKEYfr)!

## Workflow

1. Fork the repo and create a feature branch from `main`.
2. `npm install`, then `npm test` and `npm run build` must pass before opening a PR.
3. Keep changes focused; update `docs/PROJECT_STATUS.md` for significant milestones.
4. Never commit API keys, OAuth secrets, tokens or `dist/` build output.

## Standards

- TypeScript strict mode; no `any` without justification.
- Keep the extension lightweight: no new runtime dependencies without discussion.
- All user-facing strings go through `escapeHtml`/textContent — no raw innerHTML with external data.
- Discovery logic must stay pure and unit-tested (see `tests/`).
- Meaningful commit messages; no force-push to `main`.
