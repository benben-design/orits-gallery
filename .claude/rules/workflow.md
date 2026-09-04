# Workflow

## Session start

At the very beginning of every conversation, before doing anything else, ask:

> "Do you want to create a new branch for this session?"

- If **yes** → **propose a name yourself**, already in the convention below, and
  ask him to confirm or correct it. Do not ask him to invent one from nothing.
  Once he confirms, run `git checkout -b <name>` and confirm the switch before
  proceeding.
- If **no** → continue on the current branch.

Do not skip this, even for small tasks or quick questions.

### Proposing the name

Base the topic on what he has actually asked for this session. If he has not said
yet what the session is about, ask that first — a proposal invented before the
task is known is worse than no proposal.

**Check today's real date; do not assume it.** Read it from the system (`date`)
rather than guessing or carrying one over from earlier in the conversation. A
wrong date in a branch name is permanent and silently misleading.

Then say what you are proposing and why, in one line:

> "Branch `29-08-2026_artwork-page`? Today is 29-08-2026 and this session is the
> artwork page body."

He confirms or corrects. Use whatever he confirms.

## Branch naming convention

    DD-MM-YYYY_topic-in-english

- **Date first**, day-month-year, zero-padded. **Four-digit year, always** —
  never a two-digit year.
- **One underscore**, separating the date from the topic. That is the only
  underscore in the name.
- **Topic in lowercase English**, words separated by hyphens.
- No ampersands, no spaces, no capitals, no punctuation beyond hyphens and that
  single underscore.
- A session **continuing an earlier topic** appends a number: `-2`, `-3`, and so
  on.
- **Short and descriptive** — what the session is about, not how it went.

| | |
|---|---|
| ✅ | `12-09-2026_artwork-page` |
| ✅ | `12-09-2026_artwork-page-2` |
| ✅ | `15-09-2026_admin-login` |
| ❌ | `12-09-26_artwork` — two-digit year |
| ❌ | `12-09-2026_Artwork_Page` — capitals, extra underscore |
| ❌ | `12-09-2026_fixes-&-stuff` — ampersand, and says nothing |

The point is that a year of branches sorts and reads consistently. Formats drift
the moment they are improvised per session, so they are not improvised here.

## Check the English on anything permanent

He is not a native English speaker and misspellings slip through. Left
unquestioned they become permanent: on the previous project "fixxing" reached
eight branch names, alongside "improvments" and "continous".

So whenever he gives you text that gets **written into the repository
permanently** — a branch name, a file or folder name, a slug, a commit message —
check the spelling before using it.

If a word looks misspelled, **do not use it and do not silently correct it.**
Ask, showing both:

> "Did you mean `fixing`? You wrote `fixxing`."

Then use whatever he confirms. **If he says keep it, keep it, without arguing.**

Apply the same check to the convention itself: if what he gives you breaks the
format, show the corrected version and ask before creating anything.

**This applies to permanent identifiers only.** Do not correct his spelling in
ordinary conversation. He does not want that, and it is not what this rule is
for.

## Git — commit & push

**Never commit or push without explicit instruction.**

Do not run `git commit`, `git push`, or `git merge` unless asked in words
("commit", "push", "merge to main"). Making changes and leaving them ready
locally is fine — just do not ship them until told.

## Shorthand

| Symbol | Does | Deploys |
|---|---|---|
| `cp` | Commit everything + push the current branch | A **preview** deployment with its own URL. Not public, not the live site |
| `cpm` | Commit + push the current branch, **then** merge to main | Updates the branch preview **and** triggers the **production** deployment. Live |

`cpm` is a **superset of `cp`, not an alternative to it.** It commits and pushes
in exactly the same way and then merges on top — so `cpm` fires both
deployments, and the branch preview always reflects what was merged.

When either shorthand is typed, execute it without asking for further
confirmation. `cpm` puts code in front of real buyers, so make sure the commit
message is one he would want to read back later — and if the spelling rule above
applies to it, apply it.

## Never record the current branch in a rules file

**No rules file may state which branch is active.** Not this one, not any other.

The previous project's `workflow.md` carried a line reading `Active branch: main`.
It was wrong for weeks and was believed anyway, because a rules file is read as
authoritative and nobody thinks to verify it against reality. A stale fact in a
trusted file is worse than no fact at all.

Git already knows. If you need the current branch, read it:

```bash
git branch --show-current
```

The general principle: **a value that changes from day to day does not belong in
a rules file.** Current branch, today's date, the last deployment URL, how many
works are in the catalogue, what is in progress right now — all of it is read
from the source of truth at the moment it is needed, never transcribed here.
Rules files hold conventions and decisions, which change deliberately and rarely.

## Planning happens elsewhere

Features on this project are planned in a separate Cowork session, which produces
a written brief and the prompt that starts the Claude Code session. So a task
arriving here has usually already been thought through — read it as a spec.

If the brief conflicts with what the code actually looks like, say so rather than
silently doing something else. The plan was written without the codebase in view;
you have it in front of you.

## Confirm the approach before writing code

Read enough to have an informed opinion, then **state the approach and wait for
a go-ahead** — the state shape, the files it touches, what is deliberately left
out. Ask the questions that would change the work. A confirmed task, or a
confirmed branch name, is not a confirmed approach.

**Keep that phase cheap.** It must not consume a large share of a session:

- Read what the change touches, and nothing already read this session.
- No subagents to explore a codebase that is already in context.
- One question with the real forks in it, recommendation first — not a series
  of small ones.
- A short list, not an essay.

Then build the whole thing without checking back at every step. The point is to
start in the right place, not to narrate the journey.

## Keeping the rules honest

These rules files are read at the start of every session, so a stale one causes
real damage. When a change makes one wrong — a new route, a new component, a
decision reversed — update it in the same change. `app-files.md` and
`project.md`'s status table go stale fastest.

## CLAUDE.md stays empty

`CLAUDE.md` at the repo root is deliberately a 0-byte file. Do not fill it in,
and do not turn it into an index that imports the rules.

Reason: the rules under `.claude/rules/` reach the implementer on their own. But
`CLAUDE.md` is also read by the separate planning session that writes the briefs
for this repo — and `role.md` tells its reader to be an implementer. Putting
anything in `CLAUDE.md` hands the planner an instruction to stop planning.

An empty file is what keeps the two roles apart. If you think the project needs
a root-level orientation document, put it in `project.md` instead — that is
inside the rules set, where only the implementer sees it.

**Next.js will refill it if you let it.** Next 16 generates its own `CLAUDE.md`
on `next dev` start. `agentRules: false` in `next.config.mjs` is what stops that,
and it is load-bearing for this rule — not a tidiness setting. If `CLAUDE.md`
ever comes back with content nobody wrote, that flag is the first thing to check.

After any change that touches it, confirm with `wc -c CLAUDE.md` → `0`.
