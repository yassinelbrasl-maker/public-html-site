## Plan: Change the main configurator button from gold to red (WITH SKILL)

**Task:** "Change la couleur du bouton principal du configurateur en rouge. Le bouton 'Commencer' sur configurateur.html doit passer de doré à rouge."

### Step 1: Read and understand the current code

Read the skill file at `.claude/skills/cortoba-platform/SKILL.md` to understand the mandatory workflow (target master branch, push triggers auto-deploy, must verify live in Chrome after push).

Read `configurateur.html` to locate:
- The "Commencer" button at line 994: `<button class="cfg-btn-calc" onclick="cfgGo(2)">Commencer</button>`
- The `.cfg-btn-calc` CSS class at lines 229-235 that styles this button with `background: var(--accent)` (gold `#c8a96e`)
- The global `--accent` variable defined in `style.css` line 12 as `#c8a96e`

Key finding: `.cfg-btn-calc` is shared by multiple buttons (Commencer, Calculer, Continuer, Envoyer, Retour). The change must be scoped to only the Commencer button, not all of them.

### Step 2: Make the code change in configurateur.html

Edit `configurateur.html` to add a scoped CSS rule after line 235 (after the existing `.cfg-btn-calc:hover` rule):

```css
#cfg-step-1 .cfg-btn-calc { background: #e63946; }
#cfg-step-1 .cfg-btn-calc:hover { background: #d62839; transform: translateY(-1px); }
```

This targets only the Commencer button inside step 1, leaving all other `.cfg-btn-calc` buttons gold. No other files are modified. No build step needed.

### Step 3: Commit to master

1. `git status` to see current state
2. `git diff configurateur.html` to verify only the CSS lines changed
3. `git log --oneline -5` to check commit message style
4. `git add configurateur.html`
5. `git commit` with message: "Change Commencer button color from gold to red on configurateur"

### Step 4: Push to master to trigger auto-deploy

`git push origin master` -- this triggers auto-deploy to cPanel (no build step, files deployed as-is).

### Step 5: Verify live in Chrome

1. `tabs_context_mcp` to get/create a browser tab
2. `navigate` to `https://cortobaarchitecture.com/configurateur.html`
3. `javascript_tool` to force hard reload bypassing cache
4. `computer` screenshot to capture the page
5. Visually verify the Commencer button is red (`#e63946`) not gold
6. If still gold, append cache-busting query param and re-check

### Step 6: Report to the user

Show the user a screenshot proving the button is red on the live site. Confirm the commit was pushed and deployed. Note that only the Commencer button changed; other CTA buttons remain gold.

**Files modified:** `configurateur.html` only (2 CSS lines added after line 235).

**Key skill considerations:** No build step, dark theme gold palette acknowledged but overridden per user request, must visually verify in Chrome (not just say "deployed"), all work on master branch.
