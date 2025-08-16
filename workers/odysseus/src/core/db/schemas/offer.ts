import { pgTable, uuid, text, index, integer, jsonb } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-arktype';

type OfferType = 'Daily' | 'Weekly' | 'Season';

export const OFFERS = pgTable(
	'offers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		itemGrants: jsonb('item_grants').$type<string[]>().notNull(),
		type: text('type').notNull().$type<OfferType>(),
		price: integer('price').notNull(),
	},
	(offers) => {
		return {
			typeIndex: index('offers_type_idx').on(offers.type),
		};
	},
);

export type Offer = typeof OFFERS.$inferSelect;
export type NewOffer = typeof OFFERS.$inferInsert;

export const offerSelectSchema = createSelectSchema(OFFERS);
