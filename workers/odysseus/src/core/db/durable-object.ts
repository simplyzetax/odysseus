import { DurableObject } from "cloudflare:workers";
import migrations from "../../../drizzle/migrations/migrations.js";
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

export class DatabaseDurableObject extends DurableObject {

    sql: SqlStorage
    db: DrizzleSqliteDODatabase<any>;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.sql = this.ctx.storage.sql;
        this.db = drizzle(this.ctx.storage, { logger: false });

        this.ctx.blockConcurrencyWhile(async () => {
            console.log('Migrating database');
            await migrate(this.db, migrations);
        });
    }

    /**
     * Execute queries following the starbase sqlite-proxy contract used by our driver.
     * Accepts either a single query or a transaction batch and returns rows as tuples.
     */
    public async execute(
        input:
            | { sql: string; params?: any[]; method?: 'all' | 'run' | 'get' | 'values' | 'first' }
            | { transaction: { sql: string; params: any[]; method: 'all' | 'run' | 'get' | 'values' }[] }
    ): Promise<{ result: { rows: unknown[][] } | { rows: unknown[][] }[] }> {
        try {
            const runSingle = (sql: string, params: any[] = [], method: 'all' | 'run' | 'get' | 'values' | 'first' = 'all'): { rows: unknown[][] } => {
                const normalized = method === 'first' ? 'get' : method;
                if (normalized === 'run') {
                    // For run, we do not return any rows per driver expectations
                    this.sql.exec(sql, ...params);
                    return { rows: [] };
                }
                const cursor = this.sql.exec(sql, ...params);
                const rows = Array.from(cursor.raw());
                return { rows };
            };

            if ('transaction' in input) {
                const results = input.transaction.map(({ sql, params, method }) => runSingle(sql, params, method));
                return { result: results };
            }

            const single = runSingle(input.sql, input.params ?? [], input.method ?? 'all');
            return { result: single };
        } catch {
            return { result: { rows: [] } };
        }
    }

}