export interface PartyMember {
	account_id: string;
	meta: Record<string, string>;
	connections: JoinPartyConnection[];
	revision: 0;
	updated_at: string;
	joined_at: string;
	role: 'CAPTAIN' | 'MEMBER';
}

export interface PartyData {
	id: string;
	created_at: string;
	updated_at: string;
	config: CreatePartyConfig;
	members: PartyMember[];
	meta: Record<string, string>;
	invites: any[];
	revision: number;
}

export interface CreatePartyRoot {
	config: Record<string, string>;
	join_info: CreatePartyJoinInfo;
	meta?: Record<string, string>;
}

export interface CreatePartyConfig {
	type: string;
	joinability: string;
	discoverability: string;
	sub_type: string;
	max_size: number;
	invite_ttl: number;
	join_confirmation: boolean;
	intention_ttl: number;
}

export interface CreatePartyJoinInfo {
	connection: CreatePartyConnection;
	meta?: Record<string, string>;
}

export interface CreatePartyConnection {
	id: string;
	meta?: Record<string, string>;
}

export interface JoinPartyRoot {
	connection: JoinPartyConnection;
	meta?: Record<string, string>;
}

export interface JoinPartyConnection {
	id: string;
	meta: Record<string, string>;
	yield_leadership: boolean;
}

export interface UpdatePartyRoot {
	meta?: UpdatePartyMeta;
	config?: Record<string, string>;
}

export interface UpdatePartyMeta {
	update?: Record<string, string>;
	delete?: string[];
}

export interface PartyConfig {
	type: string;
	joinability: string;
	discoverability: string;
	sub_type: string;
	max_size: number;
	invite_ttl: number;
	join_confirmation: boolean;
	intention_ttl: number;
}

export interface PartyInvite {
	party_id: string;
	sent_by: string;
	meta: Record<string, string>;
	sent_to: string;
	sent_at: Date;
	updated_at: Date;
	expires_at: Date;
	status: string;
}

export interface PartyUpdate {
	meta: {
		update: Record<string, string>;
		delete: string[];
	};
	config: Record<string, string>;
}
