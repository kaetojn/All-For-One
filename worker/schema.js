// Database schema. The Worker applies any migrations it hasn't run yet the first time it
// handles a request, so there is no separate migration step in the deploy.
// To change the schema, append a new array of statements. Never edit an earlier one.

export const MIGRATIONS = [
  [
    `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE profiles (user_id TEXT PRIMARY KEY, sex TEXT, birth_year INTEGER, height_cm REAL, activity TEXT NOT NULL DEFAULT 'light', units TEXT NOT NULL DEFAULT 'metric', timezone TEXT NOT NULL DEFAULT 'America/Toronto', review_cadence TEXT NOT NULL DEFAULT 'weekly', updated_at TEXT)`,
    `CREATE TABLE goals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, start_date TEXT NOT NULL, target_date TEXT NOT NULL, start_weight_kg REAL, target_weight_kg REAL, target_body_fat REAL, target_areas TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
    `CREATE INDEX goals_user ON goals (user_id, status)`,
    `CREATE TABLE weights (user_id TEXT NOT NULL, date TEXT NOT NULL, kg REAL NOT NULL, source TEXT NOT NULL DEFAULT 'manual', PRIMARY KEY (user_id, date))`,
    `CREATE TABLE measurements (user_id TEXT NOT NULL, date TEXT NOT NULL, site TEXT NOT NULL, cm REAL NOT NULL, PRIMARY KEY (user_id, date, site))`,
    `CREATE TABLE daily_logs (user_id TEXT NOT NULL, date TEXT NOT NULL, calories INTEGER, protein_g INTEGER, target_met INTEGER, note TEXT, PRIMARY KEY (user_id, date))`,
    `CREATE TABLE targets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, calories INTEGER NOT NULL, protein_g INTEGER, reason TEXT, set_by TEXT NOT NULL, created_at TEXT NOT NULL, reverted_at TEXT)`,
    `CREATE INDEX targets_user ON targets (user_id, created_at)`,
    `CREATE TABLE oauth_clients (client_id TEXT PRIMARY KEY, name TEXT, redirect_uris TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE oauth_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE oauth_tokens (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  ],
  [
    `ALTER TABLE profiles ADD COLUMN fitness_level TEXT`,
    `ALTER TABLE profiles ADD COLUMN minutes INTEGER`,
    `ALTER TABLE profiles ADD COLUMN days_per_week INTEGER`,
    `ALTER TABLE profiles ADD COLUMN primary_goal TEXT`,
    `ALTER TABLE profiles ADD COLUMN equipment TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE profiles ADD COLUMN onboarded_at TEXT`,
    `ALTER TABLE profiles ADD COLUMN show_all INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE workout_plans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, reason TEXT, set_by TEXT NOT NULL, created_at TEXT NOT NULL, replaced_at TEXT)`,
    `CREATE INDEX workout_plans_user ON workout_plans (user_id, created_at)`,
    `CREATE TABLE workouts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, plan_id TEXT, day_index INTEGER, day_name TEXT, status TEXT NOT NULL DEFAULT 'active', started_at TEXT NOT NULL, finished_at TEXT, effort INTEGER, feeling TEXT, note TEXT, kcal INTEGER)`,
    `CREATE INDEX workouts_user ON workouts (user_id, date)`,
    `CREATE TABLE workout_items (workout_id TEXT NOT NULL, position INTEGER NOT NULL, exercise_id TEXT NOT NULL, sets INTEGER, reps INTEGER, weight_kg REAL, done INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (workout_id, position))`,
  ],
  [
    `CREATE TABLE oauth_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, step TEXT NOT NULL, ok INTEGER NOT NULL, detail TEXT)`,
    `ALTER TABLE profiles ADD COLUMN conditions TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE profiles ADD COLUMN nudge_times TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE profiles ADD COLUMN sync_key_hash TEXT`,
    `ALTER TABLE profiles ADD COLUMN skin_tone TEXT`,
    `ALTER TABLE profiles ADD COLUMN diet TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE profiles ADD COLUMN store TEXT`,
    `ALTER TABLE profiles ADD COLUMN postal TEXT`,
    `ALTER TABLE profiles ADD COLUMN weekly_budget REAL`,
    `ALTER TABLE profiles ADD COLUMN household INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE workouts ADD COLUMN symptoms TEXT`,
    `ALTER TABLE goals ADD COLUMN body_overrides TEXT`,
    `CREATE TABLE reviews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE health_days (user_id TEXT NOT NULL, date TEXT NOT NULL, active_kcal INTEGER, steps INTEGER, workout_kcal INTEGER, workout_minutes INTEGER, PRIMARY KEY (user_id, date))`,
    `CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE nudges_sent (user_id TEXT NOT NULL, date TEXT NOT NULL, slot INTEGER NOT NULL, message TEXT, PRIMARY KEY (user_id, date, slot))`,
    `CREATE TABLE meal_plans (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, plan TEXT NOT NULL, est_cost REAL, reason TEXT, created_at TEXT NOT NULL, replaced_at TEXT)`,
    `CREATE TABLE prices (chain TEXT NOT NULL, item TEXT NOT NULL, unit TEXT, price REAL NOT NULL, as_of TEXT NOT NULL, PRIMARY KEY (chain, item))`,
    `CREATE TABLE price_refresh (user_id TEXT PRIMARY KEY, requested_at TEXT NOT NULL)`,
    `CREATE TABLE photos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, pose TEXT, date TEXT NOT NULL, object_key TEXT NOT NULL, estimate TEXT, estimated_by TEXT, created_at TEXT NOT NULL)`,
    `CREATE INDEX photos_user ON photos (user_id, kind, date)`,
  ],
  [
    `ALTER TABLE profiles ADD COLUMN build TEXT`,
  ],
];

let ready = null;

export function ensureSchema(db) {
  if (!ready) ready = migrate(db).catch((e) => { ready = null; throw e; });
  return ready;
}

export function resetSchemaCache() { ready = null; }

async function migrate(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
  const row = await db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).first();
  let version = row ? Number(row.value) : 0;
  while (version < MIGRATIONS.length) {
    const statements = MIGRATIONS[version].map((sql) => db.prepare(sql));
    version += 1;
    statements.push(
      db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(String(version)),
    );
    await db.batch(statements);
  }
}
