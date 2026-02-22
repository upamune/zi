---
name: devinloop
description: >
  Iteratively improves a PR until Devin Review feedback is fully addressed.
  Triggers review by pushing updates, checks review comments and status checks,
  fixes actionable items, resolves review threads, and repeats.
  Use when the user wants to drive a PR to a clean Devin Review state.
license: MIT
compatibility: Requires git and gh (GitHub CLI) installed and authenticated.
metadata:
  author: upamune
  based_on: greptileai/skills
  version: "1.0"
allowed-tools: Bash(gh:*) Bash(git:*)
---

# Devinloop

Iteratively fix a PR until Devin Review feedback is addressed and checks are healthy.

## Inputs

- **PR number** (optional): If not provided, detect the PR for the current branch.

## Instructions

### 1. Identify the PR

```bash
gh pr view --json number,headRefName -q '{number: .number, branch: .headRefName}'
```

Switch to the PR branch if not already on it.

### 2. Loop

Repeat the following cycle. **Max 5 iterations** to avoid runaway loops.

#### A. Trigger latest review/check cycle

Push the latest changes (if any), then wait for checks to update:

```bash
git push
gh pr checks <PR_NUMBER> --watch
```

#### B. Fetch review results and comments

Get review entries and inline review comments:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments
gh pr view <PR_NUMBER> --json statusCheckRollup
```

Find the latest review signals from Devin Review bot accounts and capture unresolved comments on the latest commit.

#### C. Check exit conditions

Stop the loop if **any** of these are true:
- No actionable unresolved Devin Review comments remain **and** required checks are passing
- Max iterations reached (report current state)

#### D. Fix actionable comments

For each unresolved Devin Review comment:

1. Read the file and understand the comment in context.
2. Determine if it's actionable (code change needed) or informational.
3. If actionable, make the fix.
4. If informational or a false positive, note it and resolve the thread when appropriate.

#### E. Resolve threads

Fetch unresolved review threads and resolve all that have been addressed (see [GraphQL reference](references/graphql-queries.md)):

```bash
gh api graphql -f query='
query($cursor: String) {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body path author { login } }
          }
        }
      }
    }
  }
}'
```

Resolve addressed threads:

```bash
gh api graphql -f query='
mutation {
  t1: resolveReviewThread(input: {threadId: "ID1"}) { thread { isResolved } }
  t2: resolveReviewThread(input: {threadId: "ID2"}) { thread { isResolved } }
}'
```

#### F. Commit and push

```bash
git add -A
git commit -m "address devin review feedback (devinloop iteration N)"
git push
```

Then go back to step **A**.

### 3. Report

After exiting the loop, summarize:

| Field | Value |
|-------|-------|
| Iterations | N |
| Unresolved review comments | N |
| Checks | passing/failing/pending |
| Comments resolved | N |

If the loop exited due to max iterations, list any remaining unresolved comments and suggest next steps.

## Output format

```
Devinloop complete.
  Iterations:    2
  Resolved:      7 comments
  Remaining:     0
  Checks:        passing
```

If not fully resolved:

```
Devinloop stopped after 5 iterations.
  Resolved:      12 comments
  Remaining:     2
  Checks:        failing

Remaining issues:
  - src/auth.ts:45 — "Consider rate limiting this endpoint"
  - src/db.ts:112 — "Missing index on user_id column"
```
