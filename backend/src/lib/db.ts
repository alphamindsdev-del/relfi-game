export function now(): number {
  return Math.floor(Date.now() / 1000)
}

export async function getUserByEmail(db: D1Database, email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
}

export async function getUserByExternalAuth(
  db: D1Database,
  source: string,
  externalId: string
) {
  return db
    .prepare('SELECT * FROM users WHERE external_auth_source = ? AND external_auth_id = ?')
    .bind(source, externalId)
    .first()
}

export async function getUserById(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
}

export async function createUser(
  db: D1Database,
  fields: Record<string, unknown>
) {
  const keys = Object.keys(fields)
  const values = Object.values(fields)
  const placeholders = keys.map(() => '?').join(', ')

  await db
    .prepare(`INSERT INTO users (${keys.join(', ')}) VALUES (${placeholders})`)
    .bind(...values)
    .run()
}
