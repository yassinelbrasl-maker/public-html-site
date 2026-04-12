# Plan: Fix text overflow on mobile in landscaping.html

Task: "Il y a un probleme d'affichage sur la page landscaping.html, le texte deborde du conteneur sur mobile. Corrige ca."

---

## Step 1: Read and analyze the source file

Read `E:\public_html\public_html\landscaping.html` in its entirety to understand the page structure and all inline CSS. The file contains all styles in a single embedded `<style>` block (no external CSS dependencies besides Google Fonts). Identify all sections that could cause text overflow on mobile viewports.

## Step 2: Diagnose the text overflow issues

After reading the full CSS, the following problems cause text to overflow its container on mobile:

1. **Hero section padding uses fixed left padding but no right constraint.** The `.hero` has `padding: 0 0 5rem 5vw`, and `.hero-content` has `max-width: 680px` with no `overflow-wrap` or horizontal containment. On narrow screens, the hero title (using `clamp(2.8rem, 7vw, 6rem)`) and description text can exceed the viewport width.

2. **Manifeste section uses `padding: 9rem 5vw` with `gap: 8rem`.** At 768px and below the grid collapses to `1fr` (via the 1024px breakpoint), but `5vw` side padding combined with long French text (no `word-break` or `overflow-wrap`) can cause horizontal overflow.

3. **Services section has `padding: 9rem 5vw` and `max-width: 1300px`.** On small screens the service cards have `padding: 3rem 2.5rem` which, combined with the section padding, leaves very little room for the text body. Long words in French (e.g., "mediterraneens") can break out.

4. **Approche section uses `padding: 9rem 5vw` with `gap: 8rem`.** At <=1024px the grid switches to single column, but the `8rem` gap becomes `3rem`. The `approche-step-desc` text has no overflow protection.

5. **Philosophy section has `padding: 10rem 5vw` and `.philosophy-inner` has `max-width: 760px`.** The blockquote uses `clamp(1.6rem, 3.5vw, 2.8rem)` which is fine, but long unbroken text lines could still extend past boundaries.

6. **Contact section links** (`.contact-link`) use `padding: 1rem 2.4rem` with `letter-spacing: 0.18em` and `text-transform: uppercase`. On very narrow screens (< 360px), the buttons plus padding can exceed the container width.

7. **No global `overflow-wrap: break-word` is set.** The `body` has `overflow-x: hidden` which hides the symptom but not the cause. Long words in French content can push elements wider than the viewport.

8. **The 768px breakpoint does not reduce section padding enough.** There is no reduction of padding or gap values at 768px or 480px for the manifeste, services, approche, or contact sections.

## Step 3: Apply the CSS fixes

Edit the `<style>` block inside `landscaping.html` to make the following changes:

### 3a. Add global overflow protection on the body

Add `overflow-wrap: break-word; word-wrap: break-word;` to the `body` rule (around line 32), so all text content wraps safely when it cannot fit.

### 3b. Constrain `.hero-content` on mobile

Add to the existing `@media (max-width: 768px)` block:

    .hero-content { max-width: 90vw; }

This ensures the hero text block never exceeds the viewport minus small margins.

### 3c. Reduce padding and gap in the 768px media query

In the existing `@media (max-width: 768px)` block (line 867), add rules for the sections that use large padding and gaps:

    .manifeste { padding: 5rem 5vw; gap: 3rem; }
    .services-section { padding: 5rem 4vw; }
    .service-card { padding: 2rem 1.5rem; }
    .approche-section { padding: 5rem 5vw; gap: 2rem; }
    .contact-section { padding: 5rem 5vw; }
    .philosophy-section { padding: 6rem 5vw; }

### 3d. Enhance the 480px breakpoint

In the existing `@media (max-width: 480px)` block (line 882), add:

    .hero { padding: 0 0 3rem 5vw; }
    .hero-content { max-width: calc(100vw - 10vw); }
    .hero-title { font-size: clamp(2rem, 10vw, 2.8rem); }
    .manifeste { padding: 3.5rem 1.2rem; gap: 2rem; }
    .services-section { padding: 3.5rem 1rem; }
    .service-card { padding: 1.8rem 1.2rem; }
    .approche-section { padding: 3.5rem 1.2rem; }
    .approche-step { gap: 1rem; }
    .contact-section { padding: 4rem 1.2rem; }
    .contact-link { padding: 0.8rem 1.5rem; font-size: 0.7rem; letter-spacing: 0.1em; }
    .philosophy-section { padding: 4rem 1.2rem; }
    .section-header { flex-direction: column; align-items: flex-start; gap: 1rem; }

### 3e. Confirm overflow-x safety net

Verify that `body` already has `overflow-x: hidden` (it does, line 37). This is a safety net -- the actual root causes are addressed by the fixes above.

## Step 4: Commit changes to the `master` branch

Per the skill workflow ("All work happens on master. When you're done with changes, commit and push to master. This triggers the auto-deploy pipeline to production."):

1. Run `git status` to confirm the changed file is `landscaping.html`.
2. Run `git add landscaping.html` to stage the fix.
3. Run `git commit -m "Fix text overflow on mobile in landscaping.html

Add overflow-wrap: break-word globally. Reduce padding and gap values
in 768px and 480px media queries. Constrain hero-content width on
narrow viewports to prevent horizontal scroll."`.
4. Run `git push origin master` to trigger the auto-deploy pipeline to cPanel production.

## Step 5: Verify the fix visually in Chrome (post-deploy)

Per the skill workflow ("After pushing to master, you must verify the result is live and correct. Open cortobaarchitecture.com in Chrome using the Claude in Chrome browser tools. Force-refresh the page. Visually verify the change looks correct. Report what you see to the user."):

1. Use `tabs_context_mcp` (with `createIfEmpty: true`) to get the current Chrome tab group.
2. Create a new tab with `tabs_create_mcp`.
3. Navigate to `https://cortobaarchitecture.com/landscaping.html` using the `navigate` tool.
4. Force-refresh the page to bypass cache: use `javascript_tool` to run `location.reload(true)`, or use the `key` action with `ctrl+shift+r`.
5. Take a desktop screenshot to confirm the page loads correctly (using `computer` with `action: screenshot`).
6. Resize the browser window to a mobile viewport (375x812) using `resize_window`.
7. Take a mobile screenshot to verify that text no longer overflows its containers.
8. Scroll through each major section (hero, manifeste, projects, services, philosophy, approche, contact, footer) taking screenshots or visually confirming no horizontal overflow exists.
9. Optionally resize to 480px wide and 320px wide to test the smallest breakpoints.

## Step 6: Report to the user

Summarize the findings and actions:

- **Diagnosed**: Missing `overflow-wrap` on body, excessive padding/gap at mobile breakpoints, no padding reduction in existing 768px/480px media queries, hero-content not width-constrained on narrow viewports.
- **Fixed**: Added `overflow-wrap: break-word` globally, reduced padding and gap values in 768px and 480px breakpoints, constrained `.hero-content` width on mobile, reduced contact button padding/spacing on small screens.
- **Deployed**: Pushed to `master`, triggering auto-deploy to cPanel.
- **Verified**: Opened `cortobaarchitecture.com/landscaping.html` in Chrome, force-refreshed, confirmed at mobile viewport widths (375px, 480px) that text no longer overflows containers. Show the user the live screenshots as proof.
