---
name: cortoba-platform
description: >
  Working instructions and deployment workflow for cortobaarchitecture.com — the architecture firm's
  public website, the project configurator (configurateur.html), and the private admin platform
  (/cortoba-plateforme/). Use this skill whenever working on any file related to
  cortobaarchitecture.com, the configurateur de projet, the cortoba plateforme, or any page served
  by this codebase (index.html, landscaping.html, configurateur.html, plateforme-nas.html, API
  endpoints in /cortoba-plateforme/api/, CSS/JS assets, etc.). Also trigger when the user mentions
  "le site", "la plateforme", "le configurateur", "cortoba", or asks to test, deploy, or push
  changes to the website.
---

# Cortoba Platform — Working Instructions

You are working on the codebase for **cortobaarchitecture.com**, an architecture firm's web platform. This skill ensures you follow the team's workflow every time you touch this project.

## Architecture Overview

- **Public website**: `index.html`, `landscaping.html`, `settings.html` — marketing pages
- **Project configurator**: `configurateur.html` — a multi-step client-side form that lets potential clients estimate architecture project costs and submit requests to the private platform
- **Private admin platform**: `/cortoba-plateforme/` — dashboard (`plateforme-nas.html`), PHP API (`/api/`), chat, payments, fleet management
- **Tech stack**: PHP 8.1, vanilla JavaScript (jQuery + Bootstrap), Leaflet maps, no build tools
- **Deployment**: push to `master` branch triggers auto-deploy to cPanel — files are deployed as-is, no build step

## Workflow — Follow This Every Time

### 1. Always target the `master` branch

All work happens on `master`. When you're done with changes, commit and push to `master`. This triggers the auto-deploy pipeline to production.

### 2. Test visually on Chrome after every change

After pushing to `master`, you must verify the result is live and correct:

1. Open `cortobaarchitecture.com` (or the specific page you modified) in Chrome using the Claude in Chrome browser tools
2. Force-refresh the page to bypass cache (hard reload) so the user sees the published result immediately
3. Visually verify the change looks correct
4. Report what you see to the user

The user expects to see the live result directly — don't just say "it's deployed", prove it by showing the page.

### 3. Admin access

When you need to log into the admin platform:

- **URL**: cortobaarchitecture.com/cortoba-plateforme/
- **Email**: cortobaarchitecture@gmail.com
- **Password**: Yassine2026

If authentication fails (password may have changed), stop and tell the user immediately. Do not retry or guess — ask the user for the new password.

## Key Files Reference

| Area | Key files |
|------|-----------|
| Configurator | `configurateur.html` (184KB, self-contained) |
| Admin dashboard | `/cortoba-plateforme/plateforme-nas.html`, `plateforme-nas.js` |
| API endpoints | `/cortoba-plateforme/api/*.php` (~55 files) |
| DB config | `/cortoba-plateforme/config/` |
| Public CSS | `/css/` |
| Public JS | `/js/` |
| Database schema | `schema.sql` |

## Things to Keep in Mind

- **No build step**: files are deployed raw. There's no minification, no bundler, no Sass compilation. Edit files directly.
- **The configurator is large**: `configurateur.html` is a 184KB single file with embedded JS. Be careful with edits — read the relevant section before modifying.
- **API pattern**: PHP endpoints in `/cortoba-plateforme/api/` follow a REST-ish pattern. Check existing endpoints for conventions before creating new ones.
- **Dark theme**: the site uses CSS variables with a dark aesthetic (`#0e0e0e` background, `#c8a96e` gold accent). Respect this palette when adding UI elements.
