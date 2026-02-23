import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { nowIso } from "../utils/time.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function addMsIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function listUsers(): Array<{ id: number; username: string; displayName: string; role: string; email: string }> {
  const rows = db
    .prepare(`SELECT id, username, display_name, role, email FROM users ORDER BY id ASC`)
    .all() as Array<{ id: number; username: string; display_name: string; role: string; email: string }>;

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    email: row.email,
  }));
}

export function createUser(params: { username: string; displayName: string; role: string; email: string; password: string }): number {
  const row = db
    .prepare(`INSERT INTO users(username, display_name, role, email, password, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(params.username.trim(), params.displayName.trim(), params.role.trim() || "tester", params.email.trim(), params.password, nowIso());
  return Number(row.lastInsertRowid);
}

export function updateUser(userId: number, params: { username: string; displayName: string; role: string; email: string; password?: string }): void {
  if (params.password) {
    db.prepare(`UPDATE users SET username = ?, display_name = ?, role = ?, email = ?, password = ? WHERE id = ?`).run(
      params.username.trim(),
      params.displayName.trim(),
      params.role.trim() || "tester",
      params.email.trim(),
      params.password,
      userId,
    );
  } else {
    db.prepare(`UPDATE users SET username = ?, display_name = ?, role = ?, email = ? WHERE id = ?`).run(
      params.username.trim(),
      params.displayName.trim(),
      params.role.trim() || "tester",
      params.email.trim(),
      userId,
    );
  }
}

export function deleteUser(userId: number): void {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
}

export function findUserByUsername(username: string): { id: number; username: string; displayName: string; role: string } | null {
  const row = db
    .prepare(`SELECT id, username, display_name, role FROM users WHERE username = ?`)
    .get(username) as { id: number; username: string; display_name: string; role: string } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}

export function createSession(userId: number): string {
  const sessionId = crypto.randomUUID();
  db.prepare(`INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .run(sessionId, userId, nowIso(), addMsIso(SESSION_TTL_MS));
  return sessionId;
}

export function deleteSession(sessionId: string): void {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function getUserBySessionId(sessionId: string): { id: number; username: string; displayName: string; role: string } | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, nowIso()) as { id: number; username: string; display_name: string; role: string } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}
