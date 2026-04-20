---
name: ui-ux-pro-max
description: Comprehensive, opinionated UI/UX audit of a website, web app, or page. Use whenever the user asks to "audit", "review", "critique", "analyze", or "improve" the UI/UX, design, frontend, or user experience of a site or page — especially phrasings like "ui/ux audit", "design review", "check my landing page", "is my UX good?", "pro max audit". Also trigger when the user shares a URL or page file and asks for design feedback, accessibility checks, or responsive review. Produces a prioritized, severity-ranked report (Critical/High/Medium/Low) with concrete fixes and code snippets.
---

# UI/UX Pro Max — Comprehensive Audit

## What this skill does

Runs a rigorous, multi-axis audit of a web interface and returns a prioritized, actionable report. Not a vibes check — every finding must cite a specific element/location, explain the user impact, and propose a concrete fix (ideally with a code snippet).

## When to use

- User asks for a UI/UX audit, design review, accessibility check, or "pro max" feedback.
- User shares a URL, page file, or screenshot of a site/app for review.
- User asks to improve frontend, visual design, or user experience.
- User mentions "WCAG", "a11y", "responsive", "mobile view", "dark mode" as part of a review request.

## Audit axes (check all that apply)

The audit covers **seven axes**. For each axis, capture evidence (screenshot region, DOM snippet, computed style) before writing a finding — otherwise the critique is unfalsifiable.

1. **Visual hierarchy & layout** — scan-path, focal point, F/Z patterns, balance, alignment, grid adherence, whitespace.
2. **Typography** — font stack, scale, line-height, measure (45-75ch), contrast, weight usage, vertical rhythm.
3. **Color & contrast** — palette coherence, semantic color usage, WCAG AA contrast (4.5:1 text, 3:1 large text / UI), dark mode parity.
4. **Interaction & microcopy** — affordances, hover/focus/active/disabled states, button labels, empty states, error messages, loading states, optimistic feedback, form validation copy.
5. **Accessibility (WCAG 2.1 AA)** — semantic HTML, alt text, ARIA usage, focus order, keyboard nav, skip links, touch targets ≥44×44, reduced-motion respect.
6. **Responsiveness** — mobile (375px), tablet (768px), desktop (1440px). Check reflow, touch target spacing, horizontal scroll, image sizing, nav pattern (hamburger, bottom bar), safe-area insets.
7. **Perceived performance & feedback** — LCP hero, CLS from late-loading assets, skeleton/spinner usage, async action feedback within 100ms, error recovery paths.

Plus one cross-cutting axis:

8. **Brand consistency** — logo placement, voice/tone, repeat visual motifs, consistent component styles across pages.

## Workflow

### 1. Scope the audit

Ask the user (or infer from context) which pages/flows to audit. If they say "full audit" and there are >5 pages, prioritize: homepage → primary conversion flow → secondary pages. Announce what you'll cover before diving in.

### 2. Collect evidence with preview_* tools

Never critique from memory or assumptions. Use the preview tools to gather ground truth:

- `preview_start` — boot the dev server or serve static files.
- `preview_screenshot` — visual baseline. Take at 1440px, 768px, 375px.
- `preview_snapshot` — DOM + accessibility tree for structural analysis.
- `preview_inspect` — computed CSS for any element you're critiquing (don't guess at font sizes or colors).
- `preview_console_logs` / `preview_network` — surface JS errors and failed requests.
- `preview_click` / `preview_fill` — probe interaction states (hover, focus, disabled, validation errors).
- `preview_resize` — test breakpoints and dark mode (if toggleable).

If the preview tools aren't available for the target (e.g., external site you can't serve locally), say so explicitly and fall back to what evidence you *can* gather (source files, screenshots the user provides).

### 3. Score each axis

For each of the 8 axes, rate **Excellent / Good / Needs work / Broken** with one-sentence justification. This gives the user a dashboard view before they read the findings.

### 4. Write findings

Each finding follows this shape:

```markdown
### [SEVERITY] Short title
**Where:** file.html:line or CSS selector or page/region
**What's wrong:** One sentence. Cite the evidence (color value, pixel size, missing attribute).
**User impact:** Why this matters — who is hurt, in what situation.
**Fix:**
```code
// concrete snippet
```
```

**Severity rubric:**

- **Critical** — blocks users, violates WCAG AA, breaks on mobile, causes data loss, legal/compliance risk. Fix before next deploy.
- **High** — significant usability friction, conversion-impacting, common-path bug, contrast below threshold. Fix this sprint.
- **Medium** — polish / consistency issues, inconsistent spacing, suboptimal microcopy, minor visual bugs. Fix when touching the area.
- **Low** — nitpicks, opinionated style preferences, edge-case improvements. Backlog.

Be honest with severity. Don't inflate to seem thorough; don't deflate to seem chill. If everything is "medium" the report is useless.

### 5. Report structure

Use this exact template:

```markdown
# UI/UX Audit — [Site/Page Name]

**Scope:** [what was audited]
**Date:** [YYYY-MM-DD]
**Tools used:** [preview_* tools, source review, etc.]

## Executive summary
[3-5 sentences. Top 3 strengths, top 3 problems, one-line verdict.]

## Scorecard
| Axis | Rating | Note |
|---|---|---|
| Visual hierarchy | ... | ... |
| Typography | ... | ... |
| Color & contrast | ... | ... |
| Interaction & microcopy | ... | ... |
| Accessibility | ... | ... |
| Responsiveness | ... | ... |
| Perceived performance | ... | ... |
| Brand consistency | ... | ... |

## Findings (prioritized)

### Critical
[findings...]

### High
[findings...]

### Medium
[findings...]

### Low
[findings...]

## Quick wins
[Bulleted list of 3-5 highest-ROI fixes — small effort, big impact. Pulled from above, not new findings.]

## Recommended next steps
[3-5 bullets. What to fix first, what to investigate, what to A/B test.]
```

### 6. Offer to fix

After the report, ask: "Want me to implement the Critical + High fixes now?" Don't proactively edit files during an audit — the user may want to review the report first.

## Calibration & tone

- **Be specific.** "Typography is inconsistent" is useless. "H2 uses `clamp(1.5rem, 2vw, 2rem)` on homepage but fixed `28px` on /about — pick one scale" is useful.
- **Cite computed values, not your assumptions.** Always `preview_inspect` before claiming a color is wrong.
- **Respect the brand.** If the site uses unconventional choices deliberately (brutalism, maximalism, custom motion), flag them only if they hurt usability — not because they're unusual.
- **No filler praise.** "Looks clean and modern!" adds nothing. Either cite what specifically works (and why it works) or skip the compliment.
- **Link to WCAG success criteria** by number (e.g., "fails WCAG 2.1 SC 1.4.3 Contrast Minimum") so devs can look them up.

## Anti-patterns to avoid

- Writing generic advice ("use more whitespace") without pointing at a specific element.
- Critiquing responsiveness from a desktop screenshot — always resize first.
- Confusing personal taste with usability problems. If it's taste, label it "Low / opinion".
- Producing a 50-item punch list with no prioritization. The Critical/High section is the deliverable; everything else is supporting context.
- Reporting success ("the site is accessible!") without running actual checks. If you didn't use `preview_snapshot` for the a11y tree or test keyboard nav, say "did not verify".

## Credibility check before submitting

Before returning the report, re-read it and ask:
1. Can every finding be traced to a specific element, file, or screenshot region?
2. Does every finding have a concrete fix, not just a problem statement?
3. Is the severity honest — would I defend this ranking to an engineering lead?
4. Did I actually run the tools I'm citing, or am I bluffing?

If any answer is no, fix it before shipping the report.
