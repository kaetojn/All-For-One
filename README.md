# All For One

A personal diet and fitness tracker with Claude as the coach.

One Cloudflare Worker serves everything: the web app, its API, and a connector that lets Claude read your data and adjust your plan.

## What works today

- **Account:** the first person to sign up owns the app; sign-up then closes.
- **First run:** five quick questions (goal, level, time, equipment, basic numbers) and a starter plan is built.
- **Workouts:** a plan of ordered days built from your equipment and target areas. One tap completes an exercise; sets, reps and weights come pre-filled from last time. Each exercise has start and end photos that loop, plus written steps.
- **After a workout:** rate the effort from 1 to 10 and how you feel; the app says what that effort level means.
- **Tracking:** weight, tape measurements, and a daily food check (on target or not, calories, protein).
- **Body fat:** calculated from neck and waist (plus hips for women) and height, using the US Navy method.
- **Goal and calorie target:** an aggressive pace gets a warning and a safer alternative, and you choose.
- **Gradual unlocks:** trends, body measurements and fine-tuning open after 3, 7 and 14 check-in days. A switch in More opens everything at once.
- **Claude connector:** at `/mcp`. Claude can read everything above, log entries, search the exercise library, replace the workout plan and change the calorie target, each with a note you can read in the app.

## Also built

- **3D body:** a human figure morphed in the browser until its tape measurements match yours, with a projected goal shape you can adjust. Rendered with three.js.
- **Companion:** a small copy of that figure lives on the page. It sits on the workout card, squats while something loads, pumps a fist when you tick an exercise and cheers when you finish.
- **Photos:** private progress and meal photos, with instant estimates when `ANTHROPIC_API_KEY` is set on the Worker.
- **Food:** store, budget, household and dietary needs; a weekly meal plan and shopping list that Claude writes; a price list Claude fills in.
- **Reminders:** up to two a day, sent only when there is something to do.
- **Apple Health:** an endpoint an iPhone Shortcut posts to (`/api/health/ingest`).
- **Reviews:** Claude reads a brief, adjusts targets and plans, and saves a summary you see on the home screen.
- **Health notes:** conditions, and symptoms after a workout, with a clear stop message for warning signs.

## Not done yet

- The grocery price list starts empty; Claude fills it on the first refresh.
- The recurring review task in Claude is created once the connector is working.

## Layout

```
worker/       The backend
  index.js    Routes requests: static files, /api, /oauth, /mcp
  schema.js   Database tables; applied automatically on first request
  auth.js     Accounts, password hashing, session cookies
  store.js    Reads and writes tracking data (used by both the API and the connector)
  calc.js     Body fat, energy needs, and the calorie target a goal implies
  coach.js    Reviews, Apple Health sync and reminders
  meals.js    Meal plans, shopping list and the price list
  photos.js   Photo storage and estimates
  body.js     The measurements behind the 3D body
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

One optional Worker secret: `ANTHROPIC_API_KEY`, for instant photo estimates. The deploy token also needs R2 edit permission for the photo bucket. The session signing key is generated on first use and stored in the database.

## Credits

The body mesh, shape targets and skeleton are from the MakeHuman / MPFB2 project (CC0), as packaged in [Anny](https://github.com/naver/anny); `scripts/build-body.py` packs them. 3D rendering uses [three.js](https://threejs.org) (MIT), copied into `public/vendor/`.

Exercise data and photos come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), which is in the public domain.
