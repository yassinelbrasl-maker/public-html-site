## Step-by-step plan (without skill)

**Target file:** `configurateur.html`

**Key findings:**
- The "Commencer" button is at line 994, using class `cfg-btn-calc`
- The `cfg-btn-calc` class is defined inline at lines 229-235, with `background: var(--accent)` (gold `#c8a96e`) and `color: #0e0e0e`
- The hover style at line 235 uses `background: #dbbe82`
- The `--accent` variable is defined in `style.css` line 12 and is used site-wide -- it must NOT be changed
- The `cfg-btn-calc` class is shared by 5 buttons (Commencer, Calculer, Continuer, Envoyer, Retour au site)

**Steps:**

1. Read `configurateur.html` to confirm current state around lines 229-235 and line 994
2. Decide strategy: modify the `.cfg-btn-calc` class (affects all primary buttons) vs. target only the "Commencer" button
3. Edit `.cfg-btn-calc` CSS (line 229-234): change `background: var(--accent)` to `background: #c0392b` (red) and `color: #0e0e0e` to `color: #ffffff` (white text for contrast)
4. Edit `.cfg-btn-calc:hover` CSS (line 235): change `background: #dbbe82` to `background: #e74c3c` (lighter red on hover)
5. Verify no inline styles on individual `cfg-btn-calc` buttons override the class (confirmed: none exist)
6. Optionally update `.config-intro-cta` (lines 72-76) if the intro CTA button is also in scope
7. Do NOT modify `--accent` in `style.css` -- it is global and would break the entire site's gold accent theme
8. Test visually in browser: check button is red, text is readable, hover works, rest of page stays gold
9. Git commit and push
