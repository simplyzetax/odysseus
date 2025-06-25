import { getDB } from "@core/db/client";
import { ITEMS, itemSelectSchema, Item } from "@core/db/schemas/items";
import { PROFILES, profileTypesEnum, Profile } from "@core/db/schemas/profile";
import { and, eq, sql } from "drizzle-orm";
import { Context } from "hono";
import { Attribute, ATTRIBUTES } from "@core/db/schemas/attributes";

// Type mapping for profile types to their corresponding classes
// Using generic type to avoid circular dependency
type ProfileClassMap = {
    athena: FortniteProfileWithDBProfile<'athena'>;
    common_core: FortniteProfileWithDBProfile<'common_core'>;
    common_public: FortniteProfileWithDBProfile<'common_public'>;
    creative: FortniteProfileWithDBProfile<'creative'>;
    profile0: FortniteProfileWithDBProfile<'profile0'>;
};

// Extract profile type from the enum
type ProfileType = keyof typeof profileTypesEnum;

// Type for the formatted item structure that matches Fortnite's MCP format
export type FormattedItem = {
    templateId: string;
    attributes: Record<string, any> & {
        quantity: number;
        favorite?: boolean;
        item_seen?: 0 | 1;
    };
};

// Type for the items map returned by getItems
export type ItemsMap = Record<string, FormattedItem>;

export class FortniteProfile<T extends ProfileType = ProfileType> {

    static isValidProfileType(profileType: string): profileType is ProfileType {
        return Object.keys(profileTypesEnum).includes(profileType);
    }

    // Static factory method with perfect type safety
    static async construct<T extends ProfileType>(
        c: Context<any, any, any>,
        accountId: string,
        profileType: T
    ): Promise<ProfileClassMap[T]> {
        const baseProfile = new FortniteProfile(c, accountId, profileType);
        return baseProfile.get();
    }

    // Convenience methods for specific profiles with perfect IntelliSense
    static async athena(c: Context<any, any, any>, accountId: string): Promise<ProfileClassMap['athena']> {
        return FortniteProfile.construct(c, accountId, 'athena');
    }

    public c: Context<any, any, any>;
    public accountId: string;
    public profileType: T;
    public db: ReturnType<typeof getDB>;

    constructor(c: Context<any, any, any>, accountId: string, profileType: T) {
        this.c = c;
        this.accountId = accountId;
        this.profileType = profileType;
        this.db = getDB(c);
    }

    /**
     * Gets the profile for the account from the database and returns the specialized profile class
     * @returns The specialized profile class instance
     */
    public async get(): Promise<ProfileClassMap[T]> {
        const [dbProfile] = await this.db.select().from(PROFILES).where(
            and(
                eq(PROFILES.accountId, this.accountId),
                eq(PROFILES.type, this.profileType)
            )
        );

        if (!dbProfile) {
            throw new Error(`Profile not found for account ${this.accountId} with type ${this.profileType}`);
        }

        // For athena profile, we need to dynamically import to avoid circular dependency
        if (this.profileType === "athena") {
            const { AthenaProfile } = await import("./profiles/athena");
            return new AthenaProfile(this.c, this.accountId, this as any, dbProfile) as any;
        }

        // For other profile types, use the base class
        return new FortniteProfileWithDBProfile(this.c, this.accountId, this as any, dbProfile) as ProfileClassMap[T];
    }

    // Base methods that all profiles share
    async getRevision(): Promise<number> {
        const [profile] = await this.db.select({ rvn: PROFILES.rvn })
            .from(PROFILES)
            .where(and(
                eq(PROFILES.accountId, this.accountId),
                eq(PROFILES.type, this.profileType)
            ));

        return profile?.rvn ?? 0;
    }

    async incrementRevision(): Promise<void> {
        await this.db.update(PROFILES)
            .set({ rvn: sql`${PROFILES.rvn} + 1` })
            .where(and(
                eq(PROFILES.accountId, this.accountId),
                eq(PROFILES.type, this.profileType)
            ));
    }
}

export type BaseProfileChange = {
    changeType: string;
}

export type FullProfileUpdateChange = BaseProfileChange & {
    changeType: "fullProfileUpdate";
    profile: any;
};

export type StatModifiedChange = BaseProfileChange & {
    changeType: "statModified";
    name: string;
    value: any;
};

export type ItemAttrChangedChange = BaseProfileChange & {
    changeType: "itemAttrChanged";
    itemId: string;
    attributeName: string;
    attributeValue: any;
};

export type ProfileChange = FullProfileUpdateChange | StatModifiedChange | ItemAttrChangedChange;


export class FortniteProfileWithDBProfile<T extends ProfileType = ProfileType> extends FortniteProfile<T> {
    dbProfile: Profile;
    changes: ProfileChange[] = [];

    constructor(c: Context<any, any, any>, accountId: string, baseProfile: FortniteProfile<T>, dbProfile: Profile) {
        super(c, accountId, baseProfile.profileType);
        this.dbProfile = dbProfile;
    }

    async buildProfileObject() {
        const items = await this.getItems();
        const processedItems = await this.processItems(items);
        const attributes = await this.getAttributes();
        const processedAttributes = await this.processAttributes(attributes);

        const profile = {
            accountId: this.accountId,
            profileUniqueId: this.dbProfile.id,
            stats: {
                attributes: processedAttributes,
            },
            commandRevision: 0,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            wipeNumber: 0,
            profileId: this.profileType,
            version: 0,
            items: processedItems,
        };

        this.getRevision();

        return profile;
    }

    /**
     * Tracks a change to the profile
     * @param change 
     */
    public trackChange(change: ProfileChange) {
        // Ensure all changes are of the same type
        if (this.changes.length > 0 && this.changes[0].changeType !== change.changeType) {
            throw new Error("Cannot mix different change types in one response. All changes are: " + this.changes.map(c => c.changeType).join(", ") + " and new change is: " + change.changeType);
        }
        this.changes.push(change);
    }

    /**
     * Creates a response object for the profile
     */
    public createResponse() {
        return {
            profileId: this.profileType,              // The profile type (e.g. "athena")
            profileChanges: this.changes,      // Array of tracked changes
            serverTime: new Date().toISOString(),
            multiUpdate: [],                   // For updating multiple profiles at once
            responseVersion: 1                 // Standard API version
        };
    }


    async getItemByKey<K extends keyof Item>(
        columnName: K,
        value: Item[K]
    ) {
        // Automatically generate column mapping from Zod schema shape
        const schemaShape = itemSelectSchema.shape;
        const columnMap = Object.keys(schemaShape).reduce((acc, key) => {
            acc[key as keyof Item] = ITEMS[key as keyof typeof ITEMS];
            return acc;
        }, {} as Record<keyof Item, any>);

        const column = columnMap[columnName];
        if (!column) {
            throw new Error(`Invalid column name: ${String(columnName)}`);
        }

        return await this.db.select().from(ITEMS).where(eq(column, value));
    }

    async getItems() {
        return await this.db.select().from(ITEMS).where(eq(ITEMS.profileId, this.dbProfile.id));
    }

    async processItems(items: Item[]) {
        const itemsMap: ItemsMap = {};

        for (const dbItem of items) {
            // Ensure jsonAttributes is treated as an object, with fallback
            const jsonAttrs = (dbItem.jsonAttributes as Record<string, any>) ?? {};

            // Base attributes that are always included
            const baseAttributes: FormattedItem['attributes'] = {
                ...jsonAttrs,
                quantity: dbItem.quantity ?? 1, // Ensure quantity is always present
            };

            // Only add favorite and item_seen attributes for Athena profile type
            if (this.profileType === 'athena') {
                baseAttributes.favorite = dbItem.favorite ?? false;
                baseAttributes.item_seen = dbItem.seen ? 1 : 0;
            }

            itemsMap[dbItem.id] = {
                templateId: dbItem.templateId,
                attributes: baseAttributes,
            };
        }

        return itemsMap;
    }

    async getAttributes() {
        return await this.db.select().from(ATTRIBUTES).where(eq(ATTRIBUTES.profileId, this.dbProfile.id));
    }

    async processAttributes(attributes: Attribute[]) {
        const attributesMap: Record<string, any> = {};

        for (const dbAttribute of attributes) {
            attributesMap[dbAttribute.key] = {
                value: dbAttribute.valueJSON,
            };
        }

        return attributesMap;
    }
}