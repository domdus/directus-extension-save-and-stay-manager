import { useApi, useStores } from '@directus/extensions-sdk';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { userHasAdminAccess } from '../../shared/admin';
import { normalizeConfig, serializeConfig } from '../../shared/evaluate';
import {
	EMPTY_SAVE_AND_STAY,
	SAVE_AND_STAY_FIELD,
	type SaveAndStayConfig,
	type SaveAndStayRule,
} from '../../shared/types';

function cloneDeep<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function resolveTranslatedLabel(raw: unknown, translate: (key: string) => string): string {
	if (typeof raw !== 'string') return String(raw ?? '');
	if (!raw.startsWith('$t:')) return raw;

	const key = raw.slice(3).trim();
	if (!key) return raw;

	try {
		const translated = translate(key);
		if (translated && translated !== key) return translated;
	} catch {
		// ignore
	}

	return key;
}

function newRuleId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const loading = ref(true);
const saving = ref(false);
const cleaning = ref(false);
const config = ref<SaveAndStayConfig>(cloneDeep(EMPTY_SAVE_AND_STAY));
const initialConfig = ref<SaveAndStayConfig>(cloneDeep(EMPTY_SAVE_AND_STAY));
const roleOptions = ref<{ text: string; value: string }[]>([]);
const policyOptions = ref<{ text: string; value: string }[]>([]);
const collectionOptions = ref<{ text: string; value: string }[]>([]);

const ruleEditingId = ref<string | null>(null);
const ruleDraft = ref<SaveAndStayRule | null>(null);

let loadPromise: Promise<void> | null = null;

export function useSaveAndStayManager() {
	const api = useApi();
	const { t } = useI18n();
	const { useSettingsStore, useUserStore } = useStores() as {
		useSettingsStore: () => { hydrate?: () => Promise<void> };
		useUserStore: () => { currentUser?: unknown };
	};

	const settingsStore = useSettingsStore();
	const userStore = useUserStore();

	const hasEdits = computed(() => !isEqual(config.value, initialConfig.value));

	const configuredRules = computed(() => config.value.rules);

	const ruleSaveDisabled = computed(() => !ruleDraft.value);

	async function loadRolesAndPolicies() {
		const rolesRes = await api.get('/roles', {
			params: { limit: -1, fields: ['id', 'name'], sort: 'name' },
		});
		roleOptions.value = (rolesRes.data?.data || []).map((role: any) => ({
			text: resolveTranslatedLabel(role.name, t),
			value: role.id,
		}));

		try {
			const policiesRes = await api.get('/policies', {
				params: { limit: -1, fields: ['id', 'name'], sort: 'name' },
			});
			policyOptions.value = (policiesRes.data?.data || []).map((policy: any) => ({
				text: resolveTranslatedLabel(policy.name, t),
				value: policy.id,
			}));
		} catch {
			policyOptions.value = [];
		}
	}

	async function loadCollectionCatalog() {
		try {
			const response = await api.get('/collections', {
				params: { limit: -1 },
			});

			const rows = response.data?.data || [];
			collectionOptions.value = rows
				.filter((row: any) => {
					const name = row?.collection;
					if (!name || typeof name !== 'string') return false;
					if (name.startsWith('directus_')) return false;
					if (row?.meta?.hidden) return false;
					if (row?.schema === null && !row?.meta?.singleton) return false; // folders
					return true;
				})
				.map((row: any) => ({
					text: resolveTranslatedLabel(
						row.meta?.translations?.[0]?.translation || row.meta?.collection || row.collection,
						t,
					),
					value: String(row.collection),
				}))
				.sort((a: { text: string }, b: { text: string }) => a.text.localeCompare(b.text));
		} catch {
			collectionOptions.value = [];
		}
	}

	/** Create the settings JSON field via Studio API if missing (replaces the old server hook). */
	async function ensureSettingsField() {
		if (!userHasAdminAccess(userStore.currentUser)) return;

		try {
			await api.get(`/fields/directus_settings/${SAVE_AND_STAY_FIELD}`);
			return;
		} catch {
			// missing — create below
		}

		try {
			await api.post(`/fields/directus_settings`, {
				field: SAVE_AND_STAY_FIELD,
				type: 'json',
				meta: {
					collection: 'directus_settings',
					field: SAVE_AND_STAY_FIELD,
					special: ['cast-json'],
					interface: 'input-code',
					hidden: true,
					readonly: false,
					width: 'full',
					note: 'Managed by Save and Stay Manager. Do not edit manually.',
				},
				schema: {
					default_value: JSON.stringify(EMPTY_SAVE_AND_STAY),
				},
			});

			try {
				await settingsStore.hydrate?.();
			} catch {
				// ignore
			}
		} catch (error: any) {
			const message = String(error?.response?.data?.errors?.[0]?.message || error?.message || error || '');
			if (/already exists|duplicate/i.test(message)) return;
			throw error;
		}
	}

	async function load() {
		loading.value = true;
		try {
			await ensureSettingsField();

			const response = await api.get('/settings', {
				params: {
					limit: 1,
					fields: [SAVE_AND_STAY_FIELD],
				},
			});

			const data = response.data?.data;
			const row = Array.isArray(data) ? data[0] : data;
			const next = normalizeConfig(row?.[SAVE_AND_STAY_FIELD]);

			config.value = next;
			initialConfig.value = cloneDeep(next);

			await loadRolesAndPolicies();
			await loadCollectionCatalog();
		} finally {
			loading.value = false;
		}
	}

	function ensureLoaded() {
		if (!loadPromise) {
			loadPromise = load().finally(() => {
				/* keep */
			});
		}
		return loadPromise;
	}

	async function save() {
		if (!hasEdits.value) return;
		if (!userHasAdminAccess(userStore.currentUser)) return;

		saving.value = true;
		try {
			const payload = {
				[SAVE_AND_STAY_FIELD]: serializeConfig(config.value),
			};

			await api.patch('/settings', payload);

			try {
				await settingsStore.hydrate?.();
			} catch {
				// ignore
			}

			initialConfig.value = cloneDeep(config.value);
		} finally {
			saving.value = false;
		}
	}

	function openRuleEditor(id: string) {
		if (id === '+') {
			ruleEditingId.value = '+';
			ruleDraft.value = {
				id: newRuleId(),
				name: '',
				collections: [],
				roles: [],
				policies: [],
			};
			return;
		}

		const existing = config.value.rules.find((rule) => rule.id === id);
		if (!existing) return;

		ruleEditingId.value = id;
		ruleDraft.value = cloneDeep(existing);
	}

	function closeRuleEditor() {
		ruleEditingId.value = null;
		ruleDraft.value = null;
	}

	function onRuleDrawerToggle(open: boolean) {
		if (!open) closeRuleEditor();
	}

	function saveRuleDraft() {
		const draft = ruleDraft.value;
		if (!draft) return;

		const nextRule: SaveAndStayRule = {
			id: draft.id,
			name: draft.name?.trim() || undefined,
			collections: [...(draft.collections || [])],
			roles: [...(draft.roles || [])],
			policies: [...(draft.policies || [])],
		};

		const rules = [...config.value.rules];
		const index = rules.findIndex((rule) => rule.id === nextRule.id);

		if (index >= 0) rules[index] = nextRule;
		else rules.push(nextRule);

		config.value = { version: 1, rules };
		closeRuleEditor();
	}

	function removeRule(id: string) {
		config.value = {
			version: 1,
			rules: config.value.rules.filter((rule) => rule.id !== id),
		};
		if (ruleEditingId.value === id) closeRuleEditor();
	}

	function ruleSummary(rule: SaveAndStayRule): string {
		const collections =
			rule.collections.length === 0 ? 'all collections' : `${rule.collections.length} collection(s)`;
		const audience =
			rule.roles.length === 0 && rule.policies.length === 0
				? 'everyone'
				: `${rule.roles.length} role(s) · ${rule.policies.length} polic(ies)`;
		return `${collections} · ${audience}`;
	}

	function ruleTitle(rule: SaveAndStayRule): string {
		if (rule.name?.trim()) return rule.name.trim();
		if (rule.collections.length === 1) {
			const option = collectionOptions.value.find((entry) => entry.value === rule.collections[0]);
			return option?.text || rule.collections[0]!;
		}
		if (rule.collections.length === 0) return 'All collections';
		return `${rule.collections.length} collections`;
	}

	async function cleanupExtensionData(): Promise<{ clearedValue: boolean; deletedField: boolean }> {
		if (!userHasAdminAccess(userStore.currentUser)) {
			throw new Error('Admin access required');
		}

		cleaning.value = true;
		let clearedValue = false;
		let deletedField = false;

		try {
			try {
				await api.patch('/settings', {
					[SAVE_AND_STAY_FIELD]: null,
				});
				clearedValue = true;
			} catch {
				// ignore
			}

			try {
				await api.delete(`/fields/directus_settings/${SAVE_AND_STAY_FIELD}`);
				deletedField = true;
			} catch {
				// ignore
			}

			config.value = cloneDeep(EMPTY_SAVE_AND_STAY);
			initialConfig.value = cloneDeep(EMPTY_SAVE_AND_STAY);
			loadPromise = null;

			try {
				await settingsStore.hydrate?.();
			} catch {
				// ignore
			}

			return { clearedValue, deletedField };
		} finally {
			cleaning.value = false;
		}
	}

	async function exportConfig(): Promise<void> {
		const blob = new Blob([JSON.stringify(serializeConfig(config.value), null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'save-and-stay-config.json';
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function importConfig(file: File): Promise<void> {
		const text = await file.text();
		const parsed = JSON.parse(text);
		config.value = normalizeConfig(parsed);
	}

	return {
		loading,
		saving,
		cleaning,
		config,
		hasEdits,
		configuredRules,
		roleOptions,
		policyOptions,
		collectionOptions,
		ruleEditingId,
		ruleDraft,
		ruleSaveDisabled,
		ensureLoaded,
		save,
		openRuleEditor,
		closeRuleEditor,
		onRuleDrawerToggle,
		saveRuleDraft,
		removeRule,
		ruleSummary,
		ruleTitle,
		cleanupExtensionData,
		exportConfig,
		importConfig,
		SAVE_AND_STAY_FIELD,
	};
}
