import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';
import type { FormattedItem } from './item';

export interface BaseProfileChange {
	changeType: string;
}

export type FullProfileUpdateChange = BaseProfileChange & {
	changeType: 'fullProfileUpdate';
	profile: any;
};

export type StatModifiedChange = BaseProfileChange & {
	changeType: 'statModified';
	name: string;
	value: any;
};

export type ItemAttrChangedChange = BaseProfileChange & {
	changeType: 'itemAttrChanged';
	itemId: string;
	attributeName: string;
	attributeValue: any;
};

export type ItemAddedChange = BaseProfileChange & {
	changeType: 'itemAdded';
	item: FormattedItem;
	itemId: string;
};

export type ItemRemovedChange = BaseProfileChange & {
	changeType: 'itemRemoved';
	itemId: string;
};

export type ItemQuantityChangedChange = BaseProfileChange & {
	changeType: 'itemQuantityChanged';
	itemId: string;
	quantity: number;
};

export type ProfileChange =
	| FullProfileUpdateChange
	| StatModifiedChange
	| ItemAttrChangedChange
	| ItemAddedChange
	| ItemRemovedChange
	| ItemQuantityChangedChange;
