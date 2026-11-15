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
