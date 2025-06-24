import { drizzle } from "drizzle-orm/postgres-js";
import { HonoContext } from "../../types/context";

export const db = (c: HonoContext) => {
    return drizzle(c.env.DB.connectionString)
}