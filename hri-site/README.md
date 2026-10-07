# HRI project website – deployment guide

Structure
- public/        website (index.html) and admin page (admin.html)
- netlify/       backend functions (save/load content, admin login, activity log)

## Deploy (GitHub method – recommended)
1. Create a GitHub repository and upload everything in this folder.
2. Netlify → Add new site → Import from Git → pick the repository. Leave build command empty; Netlify reads netlify.toml.
3. Site configuration → Environment variables → add:
   - ADMIN_PASSWORD = a strong password shared with your admin team
   - SESSION_SECRET = any long random text (optional but recommended)
4. Deploy (trigger a redeploy after adding the variables).

## Deploy (Netlify CLI)
    npm install
    npm install -g netlify-cli
    netlify login
    netlify deploy --build --prod
(set the environment variables first in the Netlify dashboard)

Note: dragging the folder into Netlify Drop publishes the page but the admin and data functions will NOT work. Use Git or CLI.

Admin page: yourdomain/admin.html (also linked in the footer).
