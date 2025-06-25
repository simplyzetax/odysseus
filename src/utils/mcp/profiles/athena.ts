import { Context } from "hono";
import { FortniteProfile, FortniteProfileWithDBProfile } from "../base-profile";
import { Profile } from "@core/db/schemas/profile";
import { ITEMS } from "@core/db/schemas/items";
import { eq, inArray } from "drizzle-orm";

export class AthenaProfile extends FortniteProfileWithDBProfile<'athena'> {

    constructor(c: Context<{ Bindings: Env }>, accountId: string, baseProfile: FortniteProfile<'athena'>, dbProfile: Profile) {
        super(c, accountId, baseProfile, dbProfile);
        this.dbProfile = dbProfile;
    }

    async markItemsFavorite(itemId: string | string[], favorite: boolean = true) {
        if (typeof itemId === "string") {
            await this.db.update(ITEMS)
                .set({ favorite })
                .where(eq(ITEMS.id, itemId));
        } else {
            await this.db.update(ITEMS)
                .set({ favorite })
                .where(inArray(ITEMS.id, itemId));
        }
        await this.incrementRevision();
    }

    async markItemAsSeen(itemId: string | string[]) {
        if (typeof itemId === "string") {
            await this.db.update(ITEMS)
                .set({ seen: true })
                .where(eq(ITEMS.id, itemId));
        } else {
            await this.db.update(ITEMS)
                .set({ seen: true })
                .where(inArray(ITEMS.id, itemId));
        }
        await this.incrementRevision();
    }


}