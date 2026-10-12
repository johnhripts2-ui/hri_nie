# HRI project website (v2)

public/   website (index.html), login + editor (admin.html), style.css
netlify/  backend functions (content, login, users, activity log)

## Files changed in v2 (replace these in GitHub)
public/index.html, public/admin.html, public/style.css,
netlify/lib/shared.mjs, netlify/functions/admin.mjs, netlify/functions/content.mjs, package.json (version only)

## Logins
- Admin: Login ID `admin`, the ADMIN_PASSWORD from Netlify, and the person's own name (recorded in the log).
- Investigators / team members: created by the admin on the admin page -> "Logins" tab
  (name, login ID, password, role, components they may edit).

## Netlify settings
Publish directory: public   |   Functions directory: netlify/functions
Environment variables: ADMIN_PASSWORD, SESSION_SECRET (optional, recommended)
