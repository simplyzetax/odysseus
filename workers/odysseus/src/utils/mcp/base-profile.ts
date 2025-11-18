import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";

import type { ProfileChange } from "@otypes/fortnite/profileChanges";
import type { FormattedItem } from "@otypes/fortnite/item";
import type { Context } from "hono";
import { Profile, PROFILES, profileTypes } from "@core/db/schemas/profile";
import { getDB } from "@core/db/client";
import { Item, ITEMS, itemSelectSchema, NewItem } from "@core/db/schemas/items";
import { Attribute, ATTRIBUTES } from "@core/db/schemas/attributes";
import { odysseus } from "@core/error";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";

export type ColumnDataType<T> = T extends SQLiteColumn<infer U, any, any> ? U["data"] : never;

export class FortniteProfile {
    public readonly items: Items;
    public readonly changes: ProfileChanges;
    public readonly attributes: Attributes;
    public get formatter() {
        return new ProfileFormatter(this.profile.profileType);
    }

    constructor(public readonly profile: Profile) {
        this.items = new Items(this.profile);
        this.attributes = new Attributes(this.profile);
        this.changes = new ProfileChanges(this.items, this.attributes, this.profile.id);
    }

    static async from(accountId: string, profileType: z.infer<typeof profileTypes>): Promise<FortniteProfile | null> {
        const profile = await getDB("singleton")
            .select()
            .from(PROFILES)
            .where(and(eq(PROFILES.accountId, accountId), eq(PROFILES.profileType, profileType)))
            .get();
        if (!profile) {
            return null;
        }
        return new FortniteProfile(profile);
    }

    async buildProfileObject() {
        const items = await this.items.all();
        const processedItems = this.formatter.formatItems(items);
        const attributes = await this.attributes.all();
        const processedAttributes = this.formatter.formatAttributes(attributes);

        const profile = {
            accountId: this.profile.accountId,
            profileUniqueId: this.profile.id,
            stats: {
                attributes: processedAttributes,
            },
            commandRevision: 0,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            wipeNumber: 0,
            profileId: this.profile.profileType,
            version: 0,
            items: processedItems,
        };

        return profile;
    }

    public createResponse(): Response {
        return new Response(
            JSON.stringify({
                profileId: this.profile.profileType,
                profileChanges: this.changes.changes,
                serverTime: new Date().toISOString(),
                multiUpdate: [],
                responseVersion: 1,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }

    public static isValidProfileType(profileType: string): profileType is z.infer<typeof profileTypes> {
        return profileTypes.safeParse(profileType).success;
    }
}

class Items {
    private static readonly MULTI_ITEM_SLOTS = ["Dance", "ItemWrap"];

    constructor(
        private readonly profile: Profile
    ) { }

    async find<K extends keyof typeof itemSelectSchema.shape>(
        key: K,
        value: ColumnDataType<(typeof ITEMS)[K]>,
        multiple: false
    ): Promise<Item | null>;
    async find<K extends keyof typeof itemSelectSchema.shape>(
        key: K,
        value: ColumnDataType<(typeof ITEMS)[K]>,
        multiple: true
    ): Promise<Item[]>;
    async find<K extends keyof typeof itemSelectSchema.shape>(
        key: K,
        value: ColumnDataType<(typeof ITEMS)[K]>,
        multiple = false
    ): Promise<Item[] | Item | null> {
        const items = await getDB("singleton")
            .select()
            .from(ITEMS)
            .where(and(eq(ITEMS.profileId, this.profile.id), eq(ITEMS[key], value)));
        return multiple ? items : (items[0] ?? null);
    }

    async all(): Promise<Item[]> {
        return await getDB("singleton").select().from(ITEMS).where(eq(ITEMS.profileId, this.profile.id));
    }

    async findByIds(itemIds: string[]): Promise<Item[]> {
        return await getDB("singleton")
            .select()
            .from(ITEMS)
            .where(and(inArray(ITEMS.id, itemIds), eq(ITEMS.profileId, this.profile.id)));
    }

    async add(item: NewItem): Promise<Item | undefined> {
        const itemWithProfileId = { ...item, profileId: this.profile.id };
        const result = await getDB("singleton").insert(ITEMS).values(itemWithProfileId).returning();
        return result[0];
    }

    async update(itemId: string, attributes: Record<string, unknown>): Promise<void>;
    async update(itemIds: string[], attributes: Record<string, unknown>): Promise<void>;
    async update(itemIdOrIds: string | string[], attributes: Record<string, unknown>): Promise<void> {
        const isBulk = Array.isArray(itemIdOrIds);

        if (isBulk) {
            const items = await this.findByIds(itemIdOrIds);
            await Promise.all(
                items.map((item) =>
                    getDB("singleton")
                        .update(ITEMS)
                        .set({ ...item.jsonAttributes, ...attributes })
                        .where(eq(ITEMS.id, item.id))
                )
            );
        } else {
            const item = await this.find("id", itemIdOrIds, false);
            if (!item) {
                return odysseus.mcp.itemNotFound.withMessage(`Item with id ${itemIdOrIds} not found`).throwHttpException();
            }
            await getDB("singleton")
                .update(ITEMS)
                .set({ ...item.jsonAttributes, ...attributes })
                .where(eq(ITEMS.id, item.id));
        }
    }

    async updateSeenStatus(itemIds: string[]): Promise<void> {
        await this.update(itemIds, { seen: true });
    }

    async remove(item: Item | string): Promise<void> {
        const itemId = typeof item === "string" ? item : item.id;
        await getDB("singleton").delete(ITEMS).where(and(eq(ITEMS.id, itemId), eq(ITEMS.profileId, this.profile.id)));
    }

    async isMultiSlotItem(slotName: string): Promise<boolean> {
        return Items.MULTI_ITEM_SLOTS.includes(slotName);
    }
}

class Attributes {
    constructor(
        private readonly profile: Profile
    ) { }

    public getFavoriteAttributeKey(slotName: string) {
        return slotName.toLowerCase() === "itemwrap" ? "favorite_itemwraps" : `favorite_${slotName.toLowerCase()}`;
    }

    async get(key: string) {
        const attribute = await getDB("singleton")
            .select()
            .from(ATTRIBUTES)
            .where(and(eq(ATTRIBUTES.profileId, this.profile.id), eq(ATTRIBUTES.key, key)))
            .get();
        return attribute;
    }

    async all() {
        return await getDB("singleton").select().from(ATTRIBUTES).where(eq(ATTRIBUTES.profileId, this.profile.id));
    }

    async update(key: string, value: unknown): Promise<Attribute | undefined> {
        const result = await getDB("singleton")
            .insert(ATTRIBUTES)
            .values({ profileId: this.profile.id, key, valueJSON: value, type: typeof value })
            .onConflictDoUpdate({
                target: [ATTRIBUTES.profileId, ATTRIBUTES.key],
                set: { valueJSON: value },
            })
            .returning();
        return result[0];
    }

    updateMultiSlotValue(
        slotName: string,
        currentValue: unknown,
        itemToSlot: string,
        indexWithinSlot: number
    ): string[] {
        const array = Array.isArray(currentValue) ? currentValue : [];

        if (indexWithinSlot === -1 && itemToSlot !== "") {
            return Array.from({ length: slotName === "ItemWrap" ? 7 : 6 }, () => itemToSlot);
        }

        const result = [...array];
        while (result.length <= indexWithinSlot) {
            result.push("");
        }
        result[indexWithinSlot] = itemToSlot;
        return result;
    }
}

class ProfileChanges {
    constructor(
        private readonly items: Items,
        private readonly attributes: Attributes,
        private readonly profileId: string
    ) { }

    private finalized = false;
    public changes: ProfileChange[] = [];

    /**
     * Tracks a change to the profile.
     * @param change - The change to track.
     */
    public track(change: ProfileChange): void {
        if (this.finalized) {
            odysseus.mcp.changesAlreadyFinalized.throwHttpException();
        }
        this.changes.push(change);
    }

    /**
     * Commits the profile changes to the database.
     * @param c - The hono context to wait until the commit is complete.
     */
    public async commit(c?: Context) {
        if (this.finalized) {
            odysseus.mcp.changesAlreadyFinalized.throwHttpException();
        }
        this.finalized = true;

        const commitPromise = (async () => {
            // D1 doesn't support SQL transactions, so we execute operations sequentially
            // Each operation is atomic on its own
            /* oxlint-disable no-await-in-loop -- Operations must be sequential */
            for (const change of this.changes) {
                switch (change.changeType) {
                    case "statModified": {
                        await this.attributes.update(change.name, change.value);
                        break;
                    }
                    case "fullProfileUpdate": {
                        break;
                    }
                    case "itemAdded": {
                        await this.items.add({
                            templateId: change.item.templateId,
                            quantity: change.item.attributes.quantity,
                            profileId: this.profileId,
                            id: change.itemId,
                            favorite: change.item.attributes.favorite,
                            seen: !!change.item.attributes.item_seen,
                        });
                        break;
                    }
                    case "itemRemoved": {
                        await this.items.remove(change.itemId);
                        break;
                    }
                    case "itemQuantityChanged": {
                        await this.items.update(change.itemId, { quantity: change.quantity });
                        break;
                    }
                    case "itemAttrChanged": {
                        await this.items.update(change.itemId, { [change.attributeName]: change.attributeValue });
                        break;
                    }
                }
            }
            /* oxlint-enable no-await-in-loop */
        })().catch((error) => {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error("Failed to commit profile changes:", errorMessage, error);
            if (!c) {
                // When awaiting, we can throw the exception
                odysseus.mcp.operationFailed.withMessage(`Failed to commit changes: ${errorMessage}`).throwHttpException();
            }
            // When using waitUntil, rethrow the original error (not HTTPException) so waitUntil can handle it
            throw error;
        });

        if (c) {
            c.executionCtx.waitUntil(
                commitPromise.catch(() => {
                    // Silently handle rejections in waitUntil to prevent unhandled promise rejection warnings
                })
            );
        } else {
            await commitPromise;
        }
    }
}

class ProfileFormatter {
    constructor(private readonly profileType: z.infer<typeof profileTypes>) { }

    formatItems(items: Item[]): Record<string, FormattedItem>;
    formatItems(items: Item): FormattedItem;
    formatItems(items: Item[] | Item): Record<string, FormattedItem> | FormattedItem {
        const itemsArray = Array.isArray(items) ? items : [items];
        const formattedItems: FormattedItem[] = itemsArray.map((dbItem) => ({
            templateId: dbItem.templateId,
            attributes: {
                ...(dbItem.jsonAttributes as Record<string, unknown>),
                quantity: dbItem.quantity ?? 1,
                ...(this.profileType === "athena" && {
                    favorite: dbItem.favorite ?? false,
                    item_seen: dbItem.seen ? 1 : 0,
                }),
            },
        }));

        if (Array.isArray(items)) {
            return Object.fromEntries(itemsArray.map((dbItem, index) => [dbItem.id, formattedItems[index]])) as Record<
                string,
                FormattedItem
            >;
        }
        return formattedItems[0] as FormattedItem;
    }

    formatAttributes(attributes: Attribute[]) {
        return Object.fromEntries(attributes.map((a) => [a.key, { value: a.valueJSON }]));
    }
}
