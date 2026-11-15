# All For One

A personal diet and fitness tracker with Claude as the coach.

One Cloudflare Worker serves everything: the web app, its API, and a connector that lets Claude read your data and adjust your plan.

## What works today (stage 1)

- **Account:** the first person to sign up owns the app; sign-up then closes.
- **Tracking:** weight, tape measurements, and a daily check (on target or not, calories, protein, a note).
- **Body fat:** calculated from neck and waist (plus hips for women) and height, using the US Navy method.
- **Goal:** a target body-fat percentage or weight, a date, and the areas you want to define.
- **Calorie target:** worked out from the goal and timeline. An aggressive pace gets a warning and a safer alternative, and you choose.
- **Claude connector:** at `/mcp`. Claude can read everything above, log entries, and change the calorie target with a reason you can undo.

## Still to come

Apple Health sync, workout plans and reviews, meal plans with store prices, photos, the 3D body, and health logging.

## Layout

```
worker/       The backend
  index.js    Routes requests: static files, /api, /oauth, /mcp
  schema.js   Database tables; applied automatically on first request
  auth.js     Accounts, password hashing, session cookies
  store.js    Reads and writes tracking data (used by both the API and the connector)
  calc.js     Body fat, energy needs, and the calorie target a goal implies
  oauth.js    Sign-in flow for Claude
  mcp.js      The connector's tools
public/       The web app, served as written (no build step)
test/         Tests and a stand-in database
scripts/      A local preview server
```

## Run it locally

```
node --test                 # run the tests
node scripts/dev-server.js     # preview at http://localhost:8787 (data is lost when it stops)
```

Needs Node 22 or newer. There are no dependencies to install.

## Deploy

Pushing to `main` runs the tests and deploys the Worker. The repository needs two secrets: `CLOUDFLARE_API_TOKEN` (with Workers Scripts and D1 edit permission) and `CLOUDFLARE_ACCOUNT_ID`.

No Worker secrets are needed for stage 1. The session signing key is generated on first use and stored in the database.
