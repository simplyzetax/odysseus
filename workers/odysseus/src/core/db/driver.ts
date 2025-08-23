import { env } from "cloudflare:workers";
import {
    type RemoteCallback,
    type AsyncBatchRemoteCallback,
} from "drizzle-orm/sqlite-proxy";

export function starbase(
    identifier: string
): [RemoteCallback, AsyncBatchRemoteCallback] {

    const dbDO = env.DATABASE_DO.get(env.DATABASE_DO.idFromName(identifier));

    const singleQueryHandler: RemoteCallback = async (sql, params, method) => {

        type SingleResult = { result: { rows: unknown[][] } };

        const execResult = (await dbDO.execute({ sql, params, method })) as SingleResult;

        return {
            rows: method === "get" ? execResult.result.rows[0] : execResult.result.rows,
        };
    };

    const batchQueryHandler: AsyncBatchRemoteCallback = async (
        queries: {
            sql: string;
            params: any[];
            method: "all" | "run" | "get" | "values";
        }[]
    ) => {
        type BatchResult = { result: { rows: unknown[][] }[] };

        const execResult = (await dbDO.execute({ transaction: queries })) as BatchResult;

        return queries.map(({ method }, queryIdx) => {
            return {
                rows:
                    method === "get"
                        ? execResult.result[queryIdx].rows[0]
                        : execResult.result[queryIdx].rows,
            };
        });
    };

    return [singleQueryHandler, batchQueryHandler];
}