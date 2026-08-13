export type UserAccessContext = {
	roleIds: string[];
	policyIds: string[];
};

/** One rule: collections × (roles OR policies). Empty roles+policies = all users. */
export type SaveAndStayRule = {
	id: string;
	/** Optional label in the manager UI */
	name?: string;
	/** Empty = all content collections */
	collections: string[];
	roles: string[];
	policies: string[];
};

export type SaveAndStayConfig = {
	version: 1;
	rules: SaveAndStayRule[];
};

export const SAVE_AND_STAY_FIELD = 'save_and_stay';

export const EMPTY_SAVE_AND_STAY: SaveAndStayConfig = {
	version: 1,
	rules: [],
};
