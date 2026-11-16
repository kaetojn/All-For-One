# All For One

A personal diet and fitness tracker with Claude as the coach.

One Cloudflare Worker serves everything: the web app, its API, and a connector that lets Claude read your data and adjust your plan.

## What works today

- **Account:** the first person to sign up owns the app; sign-up then closes.
- **First run:** five quick questions (goal, level, time, equipment, basic numbers) and a starter plan is built.
- **Workouts:** a plan of ordered days built from your equipment and target areas. One tap completes an exercise; sets, reps and weights come pre-filled from last time. Each exercise has start and end photos that loop, plus written steps.
- **After a workout:** rate the effort from 1 to 10 and how you feel; the app says what that effort level means.
- **Tracking:** weight, tape measurements, and a daily food check (on target or not, calories, protein).
- **Body fat:** the US Navy tape formula (neck and waist, plus hips for women) averaged with estimates from progress photos taken in the last 30 days.
- **Goal and calorie target:** an aggressive pace gets a warning and a safer alternative, and you choose.
- **Projection:** where your weight is heading on the calorie target in force, shown on the weight chart.
- **Claude connector:** at `/mcp`. Claude can read everything above, log entries, search the exercise library, replace the workout plan and change the calorie target, each with a note you can read in the app.

## Also built

- **Body sketch:** a faceless figure drawn like an anatomy sketch, shaped by your measurements. Its pose follows body fat (passed out, slouching, standing, hands on hips, flexing) and so do the muscle lines. Build (lean, muscular, bodybuilder) and colour are set in More. The earlier 3D figure is still in the code; add `?3d` to the address to see it.
- **Companion:** a bear cub, built from simple shapes in `public/mascot.js`. It turns up only for moments worth marking: the finish screen, a workout done today, and streak milestones. It settles and stops drawing after a few seconds, and holds still when the phone asks for reduced motion.
- **Photos:** only the analysis is kept. With `ANTHROPIC_API_KEY` set on the Worker a photo is read as it arrives and never stored; otherwise it is held privately until Claude reads it at a review, then deleted.
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

The body mesh, shape targets and skeleton are from the MakeHuman / MPFB2 project (CC0), as packaged in [Anny](https://github.com/naver/anny); `scripts/build-body.py` packs them. 3D rendering uses [three.js](https://threejs.org) r187 (MIT), copied into `public/vendor/` by `scripts/vendor-three.py`, which strips comments to roughly halve the size.

Exercise data and photos come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), which is in the public domain.
