# KOVAI KURAL AI

Coimbatore District public grievance and civic information platform. The frontend remains HTML, CSS and JavaScript. The backend is Node.js/Express with SQLite; Django is not used.

## Run locally

Install Node.js 22 or later. In PowerShell, from this directory:

```powershell
npm install
$env:SESSION_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:ADMIN_SETUP_KEY = [guid]::NewGuid().ToString('N')
npm start
```

Open `http://localhost:3000/`. Create the first administrator at `/setup-admin.html` using the setup key from the same shell. The setup endpoint closes after the first admin account is created. Then sign in at `/account.html`. Citizen registration is available from the account page. Administrators can create representative accounts by changing a citizen's role and assigning an authorised constituency in the dashboard.

The SQLite database is created at `data/kovai-kural.sqlite`; complaint photos are stored in `uploads/` and delivered only through authorised routes. Set `NODE_ENV=production`, use a long private `SESSION_SECRET`, set a private `ADMIN_SETUP_KEY` and terminate HTTPS at your production host for deployment. Back up the database and uploads together.

## Features

- Responsive homepage, categories, resources, Assembly constituency directory and reusable constituency profile page.
- Ten constituency records are initialized from the current Coimbatore District Election Department list. No MLA names, photographs or party totals are fabricated.
- SQLite tables for users/roles, constituencies, categories, verified MLA profiles, resources, complaints, complaint status history and audit events.
- Citizen registration and sign-in, optional-account complaint submissions, private account report list, reference numbers, severity and age group, locality and optional supporting image.
- Representative workspace limited on the server to their assigned constituency. Admin workspace includes complaint status updates, user roles and assignments, verified MLA profile entry, resource creation, analytics and audit history.
- Public totals and category/constituency counts come from database records. Empty party and complaint states remain empty when there is no data.
- CSRF token checks on state-changing APIs, password hashing, role checks, session cookies, auth rate limits, text validation, parameterized SQL and 5 MB image size/type/signature validation.

## Current limits

- Submission records are stored in SQLite. Anonymous submissions have no login-based tracking; citizens can track submissions linked to their signed-in account.
- MLA photo upload, category management UI, constituency boundary mapping and trend chart visualization are not implemented yet. Analytics summary endpoints use actual records.
- English/Tamil selector translates only a small hero portion. Full localization is unfinished.
- This is an independent platform; submissions are not automatically filed with government authorities. Use official channels for emergency or formal filings.

## Verification sources

The Assembly constituency list was checked against Coimbatore District Administration's Election Department page: https://coimbatore.nic.in/departments/election/. It lists ten district Assembly seats and distinguishes them from the Parliamentary constituencies. Active MLA profiles must be added by an administrator with an official source URL and a verification date.

## Checks

This workspace environment did not have Node.js/npm available when the files were prepared. Install dependencies and run `npm start` before using the application. Runtime/API and browser tests could not be executed in that environment.
