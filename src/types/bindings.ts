import { CacheDurableObject } from "src";

export interface Bindings extends Omit<Env, 'CACHE_DO'> {
    CACHE_DO: DurableObjectNamespace<CacheDurableObject>;
}