import { Pool, type PoolConfig, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

interface PostgresPool {
  connect(): Promise<PoolClient>;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
}

type WorkerBindings = { HYPERDRIVE?: { connectionString: string } };

/** Nitro supplies bindings on each Worker request. Resolve them at connection time. */
function connectionOptions(options: PoolConfig): PoolConfig {
  if (process.env.GAME_HOSTING_TARGET !== "cloudflare") return options;
  const bindings = (globalThis as typeof globalThis & { __env__?: WorkerBindings }).__env__;
  if (!bindings?.HYPERDRIVE?.connectionString)
    throw new Error("The hosted database binding is unavailable");
  return { ...options, connectionString: bindings.HYPERDRIVE.connectionString };
}

/**
 * A Worker must not reuse a socket opened by another request. Hyperdrive owns
 * the shared remote pool; each query/transaction gets its own local pg pool.
 * Node deployments retain their existing process-wide pool behavior.
 */
export function createPostgresPool(options: PoolConfig): PostgresPool {
  const makePool = () => {
    const pool = new Pool(connectionOptions(options));
    pool.on("error", () => {
      /* Fail closed without logging connection secrets. */
    });
    return pool;
  };
  if (process.env.GAME_HOSTING_TARGET !== "cloudflare") return makePool();
  return {
    async connect(): Promise<PoolClient> {
      const pool = makePool();
      try {
        const client = await pool.connect();
        const release = client.release.bind(client);
        let released = false;
        client.release = (error?: Error | boolean) => {
          if (released) return;
          released = true;
          release(error);
          void pool.end().catch(() => undefined);
        };
        return client;
      } catch (error) {
        await pool.end();
        throw error;
      }
    },
    async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
      const pool = makePool();
      try {
        return await pool.query<T>(text, values);
      } finally {
        await pool.end();
      }
    },
    async end() {
      /* Connections close on release; no shared socket remains. */
    },
  };
}
