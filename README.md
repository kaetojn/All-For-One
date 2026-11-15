# All For One

A personal diet and fitness tracker with Claude as the coach.

One Cloudflare Worker serves everything: the web app, its API, and a connector that lets Claude read your data and adjust your plan.

## What works today

- **Account:** the first person to sign up owns the app; sign-up then closes.
- **First run:** five quick questions (goal, level, time, equipment, basic numbers) and a starter plan is built.
- **Workouts:** a plan of ordered days built from your equipment and target areas. One tap completes an exercise; sets, reps and weights come pre-filled from last time. Each exercise has start and end photos that loop, plus written steps.
- **After a workout:** rate the effort from 1 to 10 and how you feel; the app says what that effort level means.
- **Ember:** the mascot, a small flame that grows with your check-in streak.
- **Tracking:** weight, tape measurements, and a daily food check (on target or not, calories, protein).
- **Body fat:** calculated from neck and waist (plus hips for women) and height, using the US Navy method.
- **Goal and calorie target:** an aggressive pace gets a warning and a safer alternative, and you choose.
- **Gradual unlocks:** trends, body measurements and fine-tuning open after 3, 7 and 14 check-in days. A switch in More opens everything at once.
- **Claude connector:** at `/mcp`. Claude can read everything above, log entries, search the exercise library, replace the workout plan and change the calorie target, each with a note you can read in the app.

## Still to come

Reminders, Apple Health sync, scheduled reviews, meal plans with store prices, photos, the 3D body, and health logging.

## Layout

```
worker/       The backend
  index.js    Routes requests: static files, /api, /oauth, /mcp
  schema.js   Database tables; applied automatically on first request
  auth.js     Accounts, password hashing, session cookies
  store.js    Reads and writes tracking data (used by both the API and the connector)
  calc.js     Body fat, energy needs, and the calorie target a goal implies
  workouts.js Workout plans, sessions, streaks, unlocks and the win messages
  planner.js  Builds the starter plan and searches the exercise library
  exercise-data.js  The exercise library (generated; see scripts/build-exercises.py)
  oauth.js    Sign-in flow for Claude
  mcp.js      The connector's tools
public/       The web app, served as written (no build step)
test/         Tests and a stand-in database
scripts/      A local preview server and the exercise library builder
```

## Run it locally

```
node --test                 # run the tests
node scripts/dev-server.js     # preview at http://localhost:8787 (data is lost when it stops)
```

Needs Node 22 or newer. There are no dependencies to install.

## Deploy

Pushing to `main` runs the tests and deploys the Worker. The repository needs two secrets: `CLOUDFLARE_API_TOKEN` (with Workers Scripts and D1 edit permission) and `CLOUDFLARE_ACCOUNT_ID`.

No Worker secrets are needed yet. The session signing key is generated on first use and stored in the database.

## Credits

Exercise data and photos come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), which is in the public domain.
