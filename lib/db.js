/**
 * The database connection.
 *
 * One pooled Postgres client for the whole application. Nothing else may
 * create a pool: a connection pool is a process-wide resource, and a second
 * one competes with the first for the same small connection limit.
 *
 * This module owns the connection and nothing else. It runs no queries and
 * knows nothing about paintings — data access lives in
 * lib/data/works-repository.js, which is the only module pages and components
 * may read painting data through. See .claude/rules/data-layer.md.
 *
 * Server-side only. It must never be imported from a component marked
 * 'use client': that would ship the driver to the browser and, far worse, the
 * connection string with it.
 */
import { Pool } from 'pg';

/**
 * Reads the connection string, or explains what is missing.
 *
 * Deliberately loud. A silent fallback to a default local URL is how an app
 * ends up quietly reading the wrong database, which is a much more expensive
 * problem than a startup error.
 */
function readConnectionString() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error(
      'DATABASE_URL is not set, so there is no database to connect to.\n' +
        'Copy .env.example to .env.local and fill in the connection string:\n' +
        '  cp .env.example .env.local\n' +
        'It looks like postgresql://user:password@localhost:5432/database\n' +
        'Restart the dev server afterwards — Next reads .env.local at startup.'
    );
  }

  return value;
}

/**
 * Next's dev server re-evaluates modules on every hot reload, so a pool held
 * in module scope would be replaced — and leaked — on each edit, until
 * Postgres starts refusing connections with "too many clients". Hanging the
 * pool off globalThis is the standard way to survive that; in production the
 * module is evaluated once and this is simply a module-level singleton.
 */
const globalForDb = globalThis;

/**
 * The shared pool, created on first use.
 *
 * A function rather than an exported constant on purpose: creating the pool at
 * import time would throw on any machine without a .env.local — including
 * during `next build`, for pages that never touch the database. The failure
 * belongs at the first real use, where the message above can name the fix.
 *
 * @returns {import('pg').Pool}
 */
export function getPool() {
  if (!globalForDb.__oritDbPool) {
    const pool = new Pool({
      connectionString: readConnectionString(),

      // SSL is not configured here. node-postgres parses sslmode out of the
      // connection string, so local Postgres (no sslmode) and Neon
      // (?sslmode=require) both work without a branch in this file.

      // Modest on purpose. Serverless hosting runs many short-lived instances
      // — Netlify here, as Vercel would have — and each one holding a large
      // pool is how a small Postgres runs out of connections while sitting
      // almost idle.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    /**
     * An idle client that errors — the database restarted, the network
     * dropped — emits on the pool. With no listener, node-postgres treats it
     * as an unhandled error event and takes the process down with it.
     *
     * The detail goes to the server log and never to a user; a visitor gets
     * whatever the calling page decides to show. See .claude/rules/security.md.
     */
    pool.on('error', (error) => {
      console.error('[db] idle client error', error);
    });

    globalForDb.__oritDbPool = pool;
  }

  return globalForDb.__oritDbPool;
}
