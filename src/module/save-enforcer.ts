import { installHeaderSaveHijack } from '../save-bridge';
import {
	extractItemCollectionFromPath,
	normalizeConfig,
	shouldSaveAndStay,
} from '../shared/evaluate';
import { SAVE_AND_STAY_FIELD, type SaveAndStayConfig, type UserAccessContext } from '../shared/types';

const ENFORCER_FLAG = '__saveAndStayManagerEnforcerInstalled';

type LooseStore = {
	currentUser?: {
		id?: string;
		role?: unknown;
		roles?: unknown;
		policies?: unknown;
	} | null;
	settings?: {
		[SAVE_AND_STAY_FIELD]?: SaveAndStayConfig | null;
		default_save_action?: string | null;
	} | null;
};

function getPinia(app: any): any {
	return app?.config?.globalProperties?.$pinia || null;
}

function getStoreState(pinia: any, id: string): LooseStore | null {
	try {
		const store = pinia?._s?.get?.(id);
		return (store || null) as LooseStore | null;
	} catch {
		return null;
	}
}

function getConfig(pinia: any): SaveAndStayConfig {
	const settingsStore = getStoreState(pinia, 'settingsStore');
	return normalizeConfig(settingsStore?.settings?.[SAVE_AND_STAY_FIELD]);
}

/** Directus ≥ 12.2 project setting — when already stay, hijack is unnecessary (and the Stay menu item is hidden). */
function getNativeDefaultSaveAction(pinia: any): string | null {
	const settingsStore = getStoreState(pinia, 'settingsStore');
	const action = settingsStore?.settings?.default_save_action;
	return typeof action === 'string' && action ? action : null;
}

function pushId(target: Set<string>, value: unknown) {
	if (value == null || value === '') return;
	if (typeof value === 'object' && value !== null && 'id' in value) {
		target.add(String((value as { id: unknown }).id));
		return;
	}
	target.add(String(value));
}

function accessFromUser(user: LooseStore['currentUser']): UserAccessContext {
	const roleIds = new Set<string>();
	const policyIds = new Set<string>();
	if (!user) return { roleIds: [], policyIds: [] };

	pushId(roleIds, user.role);
	if (Array.isArray(user.roles)) {
		for (const role of user.roles) pushId(roleIds, role);
	}
	if (Array.isArray(user.policies)) {
		for (const policy of user.policies) {
			if (policy && typeof policy === 'object' && 'policy' in policy) {
				pushId(policyIds, (policy as { policy: unknown }).policy);
			} else {
				pushId(policyIds, policy);
			}
		}
	}

	return { roleIds: [...roleIds], policyIds: [...policyIds] };
}

async function enrichPolicies(
	api: any,
	user: LooseStore['currentUser'],
	base: UserAccessContext,
): Promise<UserAccessContext> {
	const roleIds = new Set(base.roleIds);
	const policyIds = new Set(base.policyIds);
	const userId = user?.id ? String(user.id) : null;

	if (!api || (!userId && roleIds.size === 0)) {
		return { roleIds: [...roleIds], policyIds: [...policyIds] };
	}

	try {
		const accessFilter =
			userId && roleIds.size > 0
				? { _or: [{ user: { _eq: userId } }, { role: { _in: [...roleIds] } }] }
				: userId
					? { user: { _eq: userId } }
					: { role: { _in: [...roleIds] } };

		const accessRes = await api.get('/access', {
			params: {
				limit: -1,
				fields: ['policy'],
				filter: accessFilter,
			},
		});

		for (const row of accessRes.data?.data || []) {
			pushId(policyIds, row?.policy);
		}
	} catch {
		// ignore
	}

	return { roleIds: [...roleIds], policyIds: [...policyIds] };
}

export function installSaveEnforcer(): void {
	if (typeof window === 'undefined') return;
	if ((window as any)[ENFORCER_FLAG]) return;

	const started = Date.now();
	let stopHijack: (() => void) | undefined;
	let lastKey = '';
	let accessCache: { userId: string | null; context: UserAccessContext; at: number } | null = null;

	const timer = window.setInterval(() => {
		const appEl = document.querySelector('#app') as any;
		const app = appEl?.__vue_app__;
		const router = app?.config?.globalProperties?.$router;
		const pinia = getPinia(app);
		const api = app?.config?.globalProperties?.$api;

		if (!app || !router || !pinia) {
			if (Date.now() - started > 45000) {
				window.clearInterval(timer);
			}
			return;
		}

		window.clearInterval(timer);
		(window as any)[ENFORCER_FLAG] = true;

		const sync = async () => {
			const path = String(router.currentRoute?.value?.path || window.location.pathname || '');
			const collection = extractItemCollectionFromPath(path);
			const userStore = getStoreState(pinia, 'userStore');
			const user = userStore?.currentUser ?? null;
			const userId = user?.id ? String(user.id) : null;

			let context: UserAccessContext;
			const now = Date.now();
			if (accessCache && accessCache.userId === userId && now - accessCache.at < 60_000) {
				context = accessCache.context;
			} else {
				const base = accessFromUser(user);
				context = await enrichPolicies(api, user, base);
				accessCache = { userId, context, at: now };
			}

			const config = getConfig(pinia);
			const enabled = shouldSaveAndStay(config, collection, context);
			const nativeDefault = getNativeDefaultSaveAction(pinia);
			// On 12.2+, if project default is already stay, Stay is removed from the split menu —
			// don't hijack (primary Save already stays). Leave project default as quit for selective rules.
			const needsHijack = enabled && nativeDefault !== 'save-and-stay';
			const key = `${needsHijack ? '1' : '0'}:${collection || ''}:${userId || ''}:${nativeDefault || ''}`;

			if (key === lastKey) return;
			lastKey = key;

			stopHijack?.();
			stopHijack = undefined;

			if (!needsHijack) return;

			stopHijack = installHeaderSaveHijack({
				tooltip: 'Save and Stay',
			});
		};

		void sync();

		router.afterEach(() => {
			void sync();
		});

		// Settings hydrate / header remounts
		window.setInterval(() => {
			void sync();
		}, 2000);
	}, 250);
}
