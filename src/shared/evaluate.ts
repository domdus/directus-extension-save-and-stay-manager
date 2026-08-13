import { EMPTY_SAVE_AND_STAY, type SaveAndStayConfig, type SaveAndStayRule, type UserAccessContext } from './types';

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

export function normalizeConfig(raw: unknown): SaveAndStayConfig {
	if (!raw || typeof raw !== 'object') return { ...EMPTY_SAVE_AND_STAY, rules: [] };

	const record = raw as Record<string, unknown>;
	const rulesIn = Array.isArray(record.rules) ? record.rules : [];

	const rules: SaveAndStayRule[] = rulesIn
		.map((entry) => {
			if (!entry || typeof entry !== 'object') return null;
			const row = entry as Record<string, unknown>;
			const id = String(row.id ?? '').trim();
			if (!id) return null;

			return {
				id,
				name: typeof row.name === 'string' ? row.name : undefined,
				collections: asStringArray(row.collections),
				roles: asStringArray(row.roles),
				policies: asStringArray(row.policies),
			};
		})
		.filter((rule): rule is SaveAndStayRule => Boolean(rule));

	return {
		version: 1,
		rules,
	};
}

export function serializeConfig(config: SaveAndStayConfig): SaveAndStayConfig {
	return normalizeConfig(config);
}

export function ruleHasAudience(rule: Pick<SaveAndStayRule, 'roles' | 'policies'>): boolean {
	return rule.roles.length > 0 || rule.policies.length > 0;
}

export function userMatchesRule(rule: Pick<SaveAndStayRule, 'roles' | 'policies'>, context: UserAccessContext): boolean {
	if (!ruleHasAudience(rule)) return true;

	const roleSet = new Set(context.roleIds.map(String));
	const policySet = new Set(context.policyIds.map(String));

	if (rule.roles.some((id) => roleSet.has(String(id)))) return true;
	if (rule.policies.some((id) => policySet.has(String(id)))) return true;
	return false;
}

export function ruleCoversCollection(rule: Pick<SaveAndStayRule, 'collections'>, collection: string): boolean {
	if (!rule.collections.length) return true;
	return rule.collections.map(String).includes(String(collection));
}

/** True when any rule covers this collection for this user. */
export function shouldSaveAndStay(
	config: SaveAndStayConfig | null | undefined,
	collection: string | null | undefined,
	context: UserAccessContext,
): boolean {
	if (!collection) return false;

	const normalized = normalizeConfig(config);
	if (!normalized.rules.length) return false;

	return normalized.rules.some(
		(rule) => ruleCoversCollection(rule, collection) && userMatchesRule(rule, context),
	);
}

export function normalizeAppPath(path: string | null | undefined): string {
	if (!path) return '';
	const trimmed = String(path).split('?')[0]?.split('#')[0] || '';
	if (!trimmed) return '';
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Item (or singleton) collection from Studio paths:
 * - `/content/<collection>/<pk>`
 * - `/content/<collection>/+`
 * - `/content/<collection>` (list or singleton — caller may still hijack if Save exists)
 */
export function extractContentCollectionFromPath(path: string): string | null {
	const normalized = normalizeAppPath(path);
	if (!normalized) return null;

	const segments = normalized.split('/').filter(Boolean);
	if (segments[0] !== 'content') return null;
	if (!segments[1] || segments[1] === '+') return null;
	return segments[1];
}

/** Prefer item routes; still returns collection for `/content/<name>` (singleton/list). */
export function extractItemCollectionFromPath(path: string): string | null {
	const normalized = normalizeAppPath(path);
	const segments = normalized.split('/').filter(Boolean);
	if (segments[0] !== 'content') return null;
	if (!segments[1] || segments[1] === '+') return null;

	// Explicit item / create
	if (segments.length >= 3) return segments[1];

	// Singleton-style or collection root — return collection; enforcer no-ops without Save btn
	return segments[1];
}
