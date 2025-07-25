import { pgTable, uuid, text, index, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-arktype';

type OfferType = 'daily' | 'weekly' | 'season';

export const OFFERS = pgTable(
	'offers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		templateId: text('template_id').notNull(),
		type: text('type').notNull().$type<OfferType>(),
		price: integer('price').notNull(),
	},
	(offers) => {
		return {
			templateIdIndex: index('offers_template_id_idx').on(offers.templateId),
		};
	},
);

export type Offer = typeof OFFERS.$inferSelect;
export type NewOffer = typeof OFFERS.$inferInsert;

export const offerSelectSchema = createSelectSchema(OFFERS);
