# Priority Levels for Ideas and Tasks

**Issue:** #15
**Date:** 2026-02-17
**Approach:** Minimal (data model + system prompt + explorer badges)

## Problem

No way to indicate importance/urgency of ideas or tasks. Everything sits at the same level, making it hard to decide what to work on next.

## Design

### Priority Levels

Three levels: `high`, `medium`, `low`. Default: `medium`.

- **high** — do soon, blocks other work or has a deadline
- **medium** — important but not urgent (default)
- **low** — nice to have, do when energy allows

### Ideas (frontmatter)

Add `priority: 'high' | 'medium' | 'low'` to `IdeaFrontmatter` in `types.ts` and the idea template.

```yaml
---
status: active
priority: medium
type: personal
energy: low
size: small
tags: []
started: false
---
```

### Tasks (inline tags)

Standard markdown checkboxes with optional `#high` or `#low` tags. No tag = medium.

```markdown
- [ ] Fix the login bug #high
- [ ] Update README
- [ ] Reorganize bookmarks #low
```

### System Prompt

- Assistant infers priority from context when capturing ideas/tasks ("urgent" -> high, "someday" -> low). Defaults to medium. Does not ask.
- Morning review and time windows: priority is a factor alongside energy and size. High-priority items surface first.
- "What should I work on?" uses priority as primary sort, then energy fit, then size fit.

### FileExplorer Badges

New IPC handler `vault:readFrontmatter` parses YAML frontmatter and returns JSON. FileExplorer reads frontmatter for `.md` files in `ideas/` and shows:

- High priority: red dot
- Medium priority: no indicator
- Low priority: gray dot

### Backward Compatibility

- Existing ideas without `priority` -> treated as medium, no badge
- Existing tasks without tags -> treated as medium
- No migration needed

## Decisions

- **Task format:** Inline `#high`/`#low` tags (not custom checkbox markers) — keeps standard markdown
- **Explorer:** Shows priority badges for ideas
- **Auto-assign:** Assistant infers priority from context, doesn't ask
- **Scope:** Data model + system prompt + explorer badges only. No priority picker UI or sort controls — iterate later if needed.
