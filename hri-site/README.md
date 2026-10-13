# HRI project website (v3)

public/   website (index.html), login + editor (admin.html), style.css
netlify/  backend functions (content, login, users, activity log, backup/restore)

## Files changed in v3 (replace these in GitHub)
public/index.html, public/admin.html, public/style.css,
netlify/lib/shared.mjs, netlify/functions/admin.mjs, netlify/functions/content.mjs

## Your data
All content, logins and the activity log live in Netlify Blobs, separate from the code.
Uploading files to GitHub / redeploying does NOT delete them.
Before any big change: sign in as admin -> "Backup" tab -> "Download backup".
Extra safety copy of the content only: open https://YOUR-SITE.netlify.app/api/content and save the page (Ctrl+S).

## Logins
- Admin: Login ID `admin`, the ADMIN_PASSWORD from Netlify, and the person's own name.
- Investigators / team members: created on the admin page -> "Logins" tab.
  Team members appear automatically under the components ticked on their login.

## Netlify settings
Publish directory: public   |   Functions directory: netlify/functions
Environment variables: ADMIN_PASSWORD, SESSION_SECRET (optional, recommended)
