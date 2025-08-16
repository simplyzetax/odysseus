import { getDB } from '@core/db/client';
import type { Attribute } from '@core/db/schemas/attributes';
import { ATTRIBUTES } from '@core/db/schemas/attributes';
import type { Item, NewItem } from '@core/db/schemas/items';
import { ITEMS, itemSelectSchema } from '@core/db/schemas/items';
import type { Profile } from '@core/db/schemas/profile';
import { PROFILES, profileTypesEnum, profileTypeValues } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { FormattedItem } from '@otypes/fortnite/item';
import { ProfileChange } from '@otypes/fortnite/profileChanges';
import { ProfileType } from '@otypes/fortnite/profiles';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ATTRIBUTE_KEYS } from './constants';

/**
 * ## Core Workflow:
 *
 * 1. **Track Changes Manually**: Use `trackChange()` to track what changes you want to make
 * 2. **Apply Automatically**: Use `applyChanges()` to automatically apply all tracked changes to the database
 *
 * ```typescript
 * // Step 1: Track all the changes you want to make
 * profile.trackChange({
 *   changeType: 'itemAttrChanged',
 *   itemId: itemId,
 *   attributeName: 'item_seen',
 *   attributeValue: true,
 * });
 *
 * profile.trackChange({
 *   changeType: 'statModified',
 *   name: 'level',
 *   value: 50,
 * });
 *
 * // Step 2: Apply all tracked changes automatically to the database
 * c.executionCtx.waitUntil(profile.applyChanges());
 *
 * // Step 3: Return the response with all changes included
 * return c.json(profile.createResponse());
 * ```
 */

// Type mapping for profile types to their corresponding classes
// Using generic type to avoid circular dependency
interface ProfileClassMap {
	[profileTypesEnum.athena]: FortniteProfileWithDBProfile<'athena'>;
	[profileTypesEnum.common_core]: FortniteProfileWithDBProfile<'common_core'>;
	[profileTypesEnum.common_public]: FortniteProfileWithDBProfile<'common_public'>;
	[profileTypesEnum.creative]: FortniteProfileWithDBProfile<'creative'>;
	[profileTypesEnum.profile0]: FortniteProfileWithDBProfile<'profile0'>;
}

export type ItemsMap = Record<string, FormattedItem>;

export const MULTI_ITEM_SLOTS = ['Dance', 'ItemWrap'];

export class FortniteProfile<T extends ProfileType = ProfileType> {
	/**
	 * Checks if the given profile type is valid
	 * @param profileType - The profile type to check
	 * @returns true if the profile type is valid
	 */
	static isValidProfileType(profileType: string | undefined): profileType is ProfileType {
		if (!profileType) return false;
		return (profileTypeValues as readonly string[]).includes(profileType);
	}

	/**
	 * Checks if the given profileId exactly matches the specified profile type
	 * @param profileId - The profile ID to check (e.g., from c.req.query("profileId"))
	 * @param expectedType - The expected profile type to match against
	 * @returns true if profileId exactly matches the expected type
	 */
	static isExactProfileType<T extends ProfileType>(profileId: string | undefined, expectedType: T): profileId is T {
		return profileId === expectedType;
	}

	/**
	 * Constructs a new profile instance from an accountId and profileType
	 * @param accountId - The account ID
	 * @param profileType - The profile type, from {@link ProfileType}
	 * @param cacheIdentifier - The cache identifier
	 * @returns The profile instance
	 */
	static async fromAccountId<T extends ProfileType>(
		accountId: string,
		profileType: T,
		cacheIdentifier: string,
	): Promise<ProfileClassMap[T]> {
		const baseProfile = new FortniteProfile(accountId, profileType, cacheIdentifier);
		return baseProfile.get();
	}

	public accountId: string;
	public profileType: T;
	public db: ReturnType<typeof getDB>;
	public cacheIdentifier: string;

	/**
	 * Constructs a new profile instance
	 * @param c - The context
	 * @param accountId - The account ID
	 * @param profileType - The profile type, from {@link ProfileType}
	 */
	constructor(accountId: string, profileType: T, cacheIdentifier: string) {
		this.accountId = accountId;
		this.profileType = profileType;
		this.db = getDB(cacheIdentifier);
		this.cacheIdentifier = cacheIdentifier;
	}

	/**
	 * Gets the profile for the account from the database and returns the specialized profile class
	 * @returns The specialized profile class instance
	 */
	public async get(): Promise<ProfileClassMap[T]> {
		const [dbProfile] = await this.db
			.select()
			.from(PROFILES)
			.where(and(eq(PROFILES.accountId, this.accountId), eq(PROFILES.type, this.profileType)));

		if (!dbProfile) {
			odysseus.mcp.profileNotFound.variable([this.accountId]).throwHttpException();
		}

		// For athena profile, we need to dynamically import to avoid circular dependency
		if (this.profileType === profileTypesEnum.athena) {
			const { AthenaProfile } = await import('./profiles/athena');
			return new AthenaProfile(this.accountId, this as any, dbProfile, this.cacheIdentifier) as any;
		}

		// For other profile types, use the base class
		return new FortniteProfileWithDBProfile(this.accountId, this as any, dbProfile, this.cacheIdentifier) as ProfileClassMap[T];
	}

	/**
	 * Gets a profile with a specific profile unique id
	 * @param profileId - The profile unique id
	 * @returns The profile
	 */
	public async getWithProfileUniqueId(profileId: string): Promise<ProfileClassMap[T]> {
		const [dbProfile] = await this.db.select().from(PROFILES).where(eq(PROFILES.id, profileId));

		if (!dbProfile) {
			odysseus.mcp.profileNotFound.variable([this.accountId]).throwHttpException();
		}

		return new FortniteProfileWithDBProfile(this.accountId, this as any, dbProfile, this.cacheIdentifier) as ProfileClassMap[T];
	}

	/**
	 * @deprecated Don't use this until further notice.
	 * This fucks up the cache on use, because it invalidates it every
	 * time we call this, due to the rvn being updated.
	 * {@link mcpCorrectionMiddleware} should handle the rvn correctly anyway
	 */
	async incrementRevision(): Promise<void> {
		await this.db
			.update(PROFILES)
			.set({ rvn: sql`${PROFILES.rvn} + 1` })
			.where(and(eq(PROFILES.accountId, this.accountId), eq(PROFILES.type, this.profileType)));
	}

	public static getFavoriteAttributeKey(slotName: string): string {
		return slotName.toLowerCase() === 'itemwrap' ? ATTRIBUTE_KEYS.FAVORITE_ITEMWRAPS : `favorite_${slotName.toLowerCase()}`;
	}

	public static updateMultiSlotValue(slotName: string, currentValue: any, itemToSlot: string, indexWithinSlot: number): string[] {
		if (!Array.isArray(currentValue)) {
			currentValue = [];
		}

		// Fill all slots with the same item
		if (indexWithinSlot === -1 && itemToSlot !== '') {
			const length = slotName === 'ItemWrap' ? 7 : 6;
			return new Array(length).fill(itemToSlot);
		}
		// Update a specific slot
		else {
			if (currentValue.length <= indexWithinSlot) {
				currentValue = currentValue.concat(new Array(indexWithinSlot - currentValue.length + 1).fill(''));
			}
			currentValue[indexWithinSlot] = itemToSlot;
			return currentValue;
		}
	}

	public static formatItemForMCP(dbItem: NewItem | Item): FormattedItem {
		return {
			templateId: dbItem.templateId,
			attributes: {
				favorite: dbItem.favorite ?? false,
				item_seen: dbItem.seen ?? false,
			},
			quantity: dbItem.quantity ?? 1,
		};
	}

	/**
	 * Combines multiple profile responses into a single uniform response.
	 * This is useful for MCP endpoints that perform operations on multiple profiles at once.
	 *
	 * @param profiles - An array of {@link FortniteProfileWithDBProfile} instances.
	 * @param profileId - The profile ID to use in the response. Defaults to 'common_core'.
	 * @returns A single response object with combined changes, multi-updates, and notifications.
	 */
	public static combineResponses(profiles: FortniteProfileWithDBProfile<any>[], profileId: string = 'common_core'): object {
		let primaryProfileChanges: ProfileChange[] = [];
		const multiUpdate: object[] = [];
		const combinedNotifications: object[] = [];

		const primaryProfile = profiles.find((p) => p.profileType === profileId);
		if (primaryProfile) {
			primaryProfileChanges = primaryProfile.changes;
		}

		for (const profile of profiles) {
			combinedNotifications.push(...profile.notifications);

			// If it's a secondary profile and has changes, add it to multiUpdate.
			if (profile.profileType !== profileId && profile.changes.length > 0) {
				const dbProfile = profile.dbProfile as Profile;
				multiUpdate.push({
					profileRevision: dbProfile.rvn,
					profileId: profile.profileType,
					profileChangesBaseRevision: dbProfile.rvn,
					profileChanges: profile.changes,
					profileCommandRevision: 0,
				});
			}
		}

		const response: any = {
			profileId,
			profileChanges: primaryProfileChanges,
			serverTime: new Date().toISOString(),
			responseVersion: 1,
		};

		if (multiUpdate.length > 0) {
			response.multiUpdate = multiUpdate;
		}

		if (combinedNotifications.length > 0) {
			response.notifications = combinedNotifications;
		}

		return response;
	}
}

/**
 * A profile with a database profile, seperated into two classes to make it type safe
 * and to avoid circular dependencies
 */
export class FortniteProfileWithDBProfile<T extends ProfileType = ProfileType> extends FortniteProfile<T> {
	public static getVariantAttributeKey(itemId: string, channel: string): string {
		return `${itemId}_variants_${channel}`;
	}

	changes: ProfileChange[] = [];
	notifications: object[] = [];
	multiChanges: ProfileChange[][] = [];
	profileId: string;
	dbProfile: Profile;

	constructor(accountId: string, baseProfile: FortniteProfile<T>, dbProfile: Profile, cacheIdentifier: string) {
		super(accountId, baseProfile.profileType, cacheIdentifier);
		this.profileId = dbProfile.id;
		this.dbProfile = dbProfile;
	}

	/**
	 * Builds a fortnite compatible profile object from the database profile
	 * @returns The profile object
	 */
	async buildProfileObject() {
		const items = await this.getItems();
		const processedItems = await this.processItems(items);
		const attributes = await this.getAttributes();
		const processedAttributes = await this.processAttributes(attributes);

		const profile = {
			accountId: this.accountId,
			profileUniqueId: this.profileId,
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

		return profile;
	}

	/**
	 * Tracks a change to the profile that will be returned in the response
	 * Used in combination with {@link createResponse} to return the changes in the response
	 * @param change
	 */
	public trackChange(change: ProfileChange) {
		// Ensure all changes are of the same type (might need to remove this in the future)
		if (this.changes.length > 0 && this.changes[0].changeType !== change.changeType) {
			throw new Error(
				'Cannot mix different change types in one response. All changes are: ' +
					this.changes.map((c) => c.changeType).join(', ') +
					' and new change is: ' +
					change.changeType,
			);
		}
		this.changes.push(change);
	}

	public trackNotification(notification: object) {
		this.notifications.push(notification);
	}

	public trackMultiChanges(changes: ProfileChange[]) {
		this.multiChanges.push(changes);
	}

	/**
	 * Tracks a change and immediately applies it to the database
	 * This is a convenience method that combines trackChange and applyChanges for single operations
	 * @param change - The change to track and apply
	 */
	public async trackAndApplyChange(change: ProfileChange) {
		this.trackChange(change);

		// Apply only the last change (the one we just added)
		const lastChange = this.changes[this.changes.length - 1];
		await this.applySingleChange(lastChange);
	}

	/**
	 * Applies all tracked changes to the database
	 * This processes all changes that have been tracked via trackChange()
	 */
	public async applyChanges() {
		for (const changes of this.multiChanges) {
			for (const change of changes) {
				await this.applySingleChange(change);
			}
		}

		for (const change of this.changes) {
			await this.applySingleChange(change);
		}
	}

	/**
	 * Creates a response object for the profile and optionally applies all changes first
	 * @param autoApply - Whether to automatically apply all tracked changes before creating the response
	 * @returns The response object
	 */
	public createResponse() {
		return {
			profileId: this.profileType, // The profile type (e.g. "athena")
			profileChanges: this.changes, // Array of tracked changes
			serverTime: new Date().toISOString(),
			multiUpdate: this.multiChanges, // For updating multiple profiles at once
			responseVersion: 1, // Standard API version
			...(this.notifications && { notifications: this.notifications }),
		};
	}

	/**
	 * Applies a single change to the database
	 * @param change - The change to apply
	 */
	private async applySingleChange(change: ProfileChange) {
		switch (change.changeType) {
			case 'fullProfileUpdate':
				// No database operations needed for full profile update
				break;

			case 'statModified':
				await this.updateAttribute(change.name, change.value);
				break;

			case 'itemAttrChanged':
				const item = await this.getItemBy('id', change.itemId);
				if (!item) {
					throw new Error(`Item with ID ${change.itemId} not found for attribute change`);
				}

				if (change.attributeName === 'favorite') {
					await this.modifyItem(change.itemId, 'favorite', change.attributeValue);
				} else if (change.attributeName === 'item_seen') {
					await this.modifyItem(change.itemId, 'seen', change.attributeValue);
				} else if (change.attributeName === 'quantity') {
					await this.modifyItem(change.itemId, 'quantity', change.attributeValue);
				} else {
					const currentJsonAttrs = (item.jsonAttributes as Record<string, any>) || {};
					const updatedJsonAttrs = {
						...currentJsonAttrs,
						[change.attributeName]: change.attributeValue,
					};
					await this.updateItem(change.itemId, updatedJsonAttrs);
				}
				break;

			case 'itemAdded':
				const templateId = change.item.templateId;
				const addedItem = await this.addItem(templateId, change.item.attributes);

				if (addedItem.id !== change.itemId) {
					change.itemId = addedItem.id;
				}
				break;

			case 'itemRemoved':
				await this.removeItems(change.itemId);
				break;

			case 'itemQuantityChanged':
				await this.modifyItem(change.itemId, 'quantity', change.quantity);
				break;

			default:
				const _exhaustiveCheck: never = change;
				throw new Error(`Unhandled change type: ${(change as any).changeType}`);
		}
	}

	/**
	 * Gets an item from the database by a given key
	 * @param columnName - The column name to search by
	 * @param value - The value to search for
	 * @returns The item
	 */
	async getItemBy<K extends keyof Item>(columnName: K, value: Item[K], disableCache: boolean = false) {
		// Map item properties to their corresponding ITEMS columns
		const columnMap = {
			id: ITEMS.id,
			templateId: ITEMS.templateId,
			profileId: ITEMS.profileId,
			jsonAttributes: ITEMS.jsonAttributes,
			quantity: ITEMS.quantity,
			favorite: ITEMS.favorite,
			seen: ITEMS.seen,
		} as const;

		const column = columnMap[columnName as keyof typeof columnMap];
		if (!column) {
			throw new Error(`Invalid column name: ${String(columnName)}`);
		}

		// Handle null values by using isNull instead of eq
		const whereCondition = value === null ? sql`${column} IS NULL` : eq(column, value);
		const [item] = disableCache
			? await this.db.select().from(ITEMS).where(whereCondition).$withCache(false)
			: await this.db.select().from(ITEMS).where(whereCondition);

		return item;
	}

	/**
	 * Checks if the given slot name is a multi-slot item
	 * @param slotName - The slot name to check
	 * @returns true if the slot name is a multi-slot item
	 */
	isMultiSlotItem(slotName: string) {
		return MULTI_ITEM_SLOTS.includes(slotName);
	}

	/**
	 * Gets all items from the database for the profile
	 * @returns The items
	 */
	async getItems() {
		return await this.db.select().from(ITEMS).where(eq(ITEMS.profileId, this.profileId));
	}

	/**
	 * Processes the items to be returned in the response, making it compatible with the MCP response
	 * @param items - The items to process
	 * @returns The processed items
	 */
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
			if (this.profileType === profileTypesEnum.athena) {
				baseAttributes.favorite = dbItem.favorite ?? false;
				baseAttributes.item_seen = dbItem.seen ?? false;
			}

			itemsMap[dbItem.id] = {
				templateId: dbItem.templateId,
				attributes: baseAttributes,
				quantity: dbItem.quantity ?? 1,
			};
		}

		return itemsMap;
	}

	/**
	 * Gets all attributes from the database for the profile
	 * @returns The attributes
	 */
	async getAttributes() {
		return await this.db.select().from(ATTRIBUTES).where(eq(ATTRIBUTES.profileId, this.profileId));
	}

	/**
	 * Processes the attributes to be returned in the response, making it compatible with the MCP response
	 * @param attributes - The attributes to process
	 * @returns The processed attributes
	 */
	async processAttributes(attributes: Attribute[]) {
		const attributesMap: Record<string, any> = {};

		for (const dbAttribute of attributes) {
			attributesMap[dbAttribute.key] = {
				value: dbAttribute.valueJSON,
			};
		}

		return attributesMap;
	}

	async getAttribute(attributeName: string): Promise<Attribute | undefined> {
		const [attribute] = await this.db
			.select()
			.from(ATTRIBUTES)
			.where(and(eq(ATTRIBUTES.key, attributeName), eq(ATTRIBUTES.profileId, this.profileId)));
		return attribute;
	}

	createAttribute(attributeName: string, value: any) {
		return {
			key: attributeName,
			valueJSON: value,
			profileId: this.profileId,
			type: this.profileType,
		};
	}

	/**
	 * Updates an attribute in the database, creating it if it doesn't exist
	 * @param attributeName - The key of the attribute to update
	 * @param value - The value to update the attribute to
	 */
	async updateAttribute<K extends keyof Omit<Attribute, 'profileId'>>(attributeName: string, value: Attribute[K]) {
		await this.db
			.insert(ATTRIBUTES)
			.values({
				profileId: this.profileId,
				type: this.profileType,
				key: attributeName,
				valueJSON: value,
			})
			.onConflictDoUpdate({
				target: [ATTRIBUTES.profileId, ATTRIBUTES.key],
				set: { valueJSON: value },
			});
	}

	async updateAttributes(attributes: Record<string, any>) {
		await this.db.update(ATTRIBUTES).set(attributes).where(eq(ATTRIBUTES.profileId, this.profileId));
	}

	/**
	 * Adds an item to the database
	 * @param itemId - The ID of the item to add
	 * @param attributes - The attributes json value of the item
	 */
	async addItem(itemId: string, attributes?: Record<string, any>) {
		const [item] = await this.db
			.insert(ITEMS)
			.values({
				profileId: this.profileId,
				templateId: itemId,
				jsonAttributes: attributes,
			})
			.returning();

		return item;
	}

	async removeItems(itemIds: string[] | string) {
		if (typeof itemIds === 'string') {
			await this.db.delete(ITEMS).where(eq(ITEMS.id, itemIds));
		} else {
			await this.db.delete(ITEMS).where(inArray(ITEMS.id, itemIds));
		}
	}

	async updateItem(itemId: string, attributes: Record<string, any>) {
		await this.db.update(ITEMS).set({ jsonAttributes: attributes }).where(eq(ITEMS.id, itemId));
	}

	/**
	 * Modifies an item in the database
	 * @param itemId - The ID of the item to modify
	 * @param key - The key of the item to modify
	 * @param value - The value to modify the item to
	 */
	async modifyItem<K extends keyof Omit<Item, 'id' | 'profileId'>>(itemId: string, key: K, value: Item[K]) {
		await this.db
			.update(ITEMS)
			.set({ [key]: value })
			.where(and(eq(ITEMS.profileId, this.profileId), eq(ITEMS.id, itemId)));
	}

	/**
	 * Marks one or more items as favorite in the database
	 * @param itemIds - The IDs of the items to mark as favorite
	 * @param favorite - Whether the items should be marked as favorite
	 */
	async updateFavoriteStatus(itemIds: string | string[], favorite: boolean = true) {
		if (typeof itemIds === 'string') {
			await this.db.update(ITEMS).set({ favorite }).where(eq(ITEMS.id, itemIds));
		} else {
			await this.db.update(ITEMS).set({ favorite }).where(inArray(ITEMS.id, itemIds));
		}
	}

	/**
	 * Marks one or more items as seen in the database
	 * @param itemId - The ID of the item to mark as seen
	 */
	async updateSeenStatus(itemIds: string | string[]) {
		if (typeof itemIds === 'string') {
			await this.db.update(ITEMS).set({ seen: true }).where(eq(ITEMS.id, itemIds));
		} else {
			await this.db.update(ITEMS).set({ seen: true }).where(inArray(ITEMS.id, itemIds));
		}
	}

	/**
	 * Convenience method to track and apply an item attribute change
	 * @param itemId - The ID of the item to modify
	 * @param attributeName - The name of the attribute to change
	 * @param attributeValue - The new value for the attribute
	 * @param autoApply - Whether to immediately apply the change to the database
	 */
	public async changeItemAttribute(itemId: string, attributeName: string, attributeValue: any, autoApply: boolean = true) {
		const change: ProfileChange = {
			changeType: 'itemAttrChanged',
			itemId,
			attributeName,
			attributeValue,
		};

		if (autoApply) {
			await this.trackAndApplyChange(change);
		} else {
			this.trackChange(change);
		}
	}

	/**
	 * Convenience method to track and apply a stat modification
	 * @param name - The name of the stat/attribute to modify
	 * @param value - The new value for the stat
	 * @param autoApply - Whether to immediately apply the change to the database
	 */
	public async modifyStat(name: string, value: any, autoApply: boolean = true) {
		const change: ProfileChange = {
			changeType: 'statModified',
			name,
			value,
		};

		if (autoApply) {
			await this.trackAndApplyChange(change);
		} else {
			this.trackChange(change);
		}
	}

	/**
	 * Convenience method to track and apply item addition
	 * @param templateId - The template ID of the item to add
	 * @param attributes - Optional attributes for the item
	 * @param autoApply - Whether to immediately apply the change to the database
	 * @returns The added item
	 */
	public async addItemWithChange(templateId: string, attributes?: Record<string, any>, autoApply: boolean = true) {
		// First add the item to get the actual ID
		const addedItem = await this.addItem(templateId, attributes);

		const change: ProfileChange = {
			changeType: 'itemAdded',
			itemId: addedItem.id,
			item: FortniteProfile.formatItemForMCP(addedItem),
		};

		// Track the change (don't apply since we already added it)
		this.trackChange(change);

		return addedItem;
	}

	/**
	 * Convenience method to track and apply item removal
	 * @param itemId - The ID of the item to remove
	 * @param autoApply - Whether to immediately apply the change to the database
	 */
	public async removeItemWithChange(itemId: string, autoApply: boolean = true) {
		const change: ProfileChange = {
			changeType: 'itemRemoved',
			itemId,
		};

		if (autoApply) {
			await this.trackAndApplyChange(change);
		} else {
			this.trackChange(change);
		}
	}

	/**
	 * Convenience method to track and apply quantity changes
	 * @param itemId - The ID of the item to modify
	 * @param quantity - The new quantity
	 * @param autoApply - Whether to immediately apply the change to the database
	 */
	public async changeItemQuantity(itemId: string, quantity: number, autoApply: boolean = true) {
		const change: ProfileChange = {
			changeType: 'itemQuantityChanged',
			itemId,
			quantity,
		};

		if (autoApply) {
			await this.trackAndApplyChange(change);
		} else {
			this.trackChange(change);
		}
	}
}
