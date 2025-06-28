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

export type ProfileChange = FullProfileUpdateChange | StatModifiedChange | ItemAttrChangedChange;
