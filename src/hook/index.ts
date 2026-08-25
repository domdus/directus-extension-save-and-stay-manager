import { defineHook } from '@directus/extensions-sdk';
import { normalizeConfig, userMatchesRule } from '../shared/evaluate';
import { EMPTY_SAVE_AND_STAY, SAVE_AND_STAY_FIELD, type UserAccessContext } from '../shared/types';

type Accountability = {
	admin?: boolean | null;
	user?: string | null;
	role?: string | null;
	roles?: string[] | null;
};

async function resolveUserAccessContext(
	database: any,
	accountability: Accountability | null | undefined,
): Promise<UserAccessContext> {
	const roleIds = new Set<string>();
	const policyIds = new Set<string>();

	if (!accountability?.user && !accountability?.role) {
		return { roleIds: [], policyIds: [] };
	}

	if (accountability.role) {
		roleIds.add(String(accountability.role));
	}

	if (Array.isArray(accountability.roles)) {
		for (const roleId of accountability.roles) {
			if (roleId) roleIds.add(String(roleId));
		}
	}

	try {
		const hasParent = await database.schema.hasColumn('directus_roles', 'parent');
		if (hasParent) {
			let frontier = [...roleIds];
			while (frontier.length) {
				const parents = await database('directus_roles').select('parent').whereIn('id', frontier);
				frontier = [];
				for (const row of parents || []) {
					const parent = row?.parent == null ? null : String(row.parent);
					if (parent && !roleIds.has(parent)) {
						roleIds.add(parent);
						frontier.push(parent);
					}
				}
			}
		}
	} catch {
		// ignore
	}

	try {
		const hasAccess = await database.schema.hasTable('directus_access');
		if (hasAccess && (accountability.user || roleIds.size > 0)) {
			const query = database('directus_access').select('policy').where((qb: any) => {
				let hasClause = false;
				if (accountability.user) {
					qb.where({ user: accountability.user });
					hasClause = true;
				}
				if (roleIds.size > 0) {
					if (hasClause) qb.orWhereIn('role', [...roleIds]);
					else qb.whereIn('role', [...roleIds]);
				}
			});
			const accessRows = await query;
			for (const row of accessRows || []) {
				if (row?.policy) policyIds.add(String(row.policy));
			}
		}
	} catch {
		// ignore
	}

	return { roleIds: [...roleIds], policyIds: [...policyIds] };
}

async function ensureSaveAndStayField(services: any, getSchema: () => Promise<any>, database: any, logger: any) {
	try {
		const hasColumn = await database.schema.hasColumn('directus_settings', SAVE_AND_STAY_FIELD);

		if (hasColumn) {
			const existingMeta = await database('directus_fields')
				.where({ collection: 'directus_settings', field: SAVE_AND_STAY_FIELD })
				.first();
			if (existingMeta) return;
		}

		const schema = await getSchema();
		const { FieldsService } = services;
		const fieldsService = new FieldsService({
			schema,
			accountability: { admin: true },
		});

		const existingFields = await fieldsService.readAll('directus_settings');
		const alreadyRegistered = existingFields?.some((field: any) => field.field === SAVE_AND_STAY_FIELD);
		if (alreadyRegistered && hasColumn) return;

		if (!hasColumn || !alreadyRegistered) {
			await fieldsService.createField('directus_settings', {
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
					note: 'Managed by Save and Stay Manager extension. Do not edit manually.',
				},
				schema: {
					default_value: JSON.stringify(EMPTY_SAVE_AND_STAY),
				},
			});
			logger?.info?.(`[save-and-stay-manager] Created directus_settings.${SAVE_AND_STAY_FIELD}`);
		}
	} catch (error: any) {
		const message = String(error?.message || error || '');
		if (/already exists|duplicate|SQLITE_ERROR/i.test(message)) {
			logger?.warn?.(`[save-and-stay-manager] Field ensure skipped: ${message}`);
			return;
		}
		logger?.warn?.(`[save-and-stay-manager] Could not ensure settings field: ${message}`);
	}
}

function getSettingsRows(payload: unknown): Record<string, any>[] | null {
	if (Array.isArray(payload)) return payload;
	if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
		return (payload as any).data;
	}
	if (payload && typeof payload === 'object' && SAVE_AND_STAY_FIELD in (payload as any)) {
		return [payload as Record<string, any>];
	}
	if (payload && typeof payload === 'object' && (payload as any).data && typeof (payload as any).data === 'object') {
		return [(payload as any).data];
	}
	return null;
}

/**
 * Directus 12.2+ minimal app access no longer grants read on custom
 * `directus_settings` fields. Inject applicable Save and Stay rules from DB
 * so Studio enforcers keep working for non-admins.
 */
export default defineHook(({ filter, init, action }, { services, database, getSchema, logger }) => {
	let fieldReady: Promise<void> | null = null;

	const ensureOnce = () => {
		if (!fieldReady) {
			fieldReady = ensureSaveAndStayField(services, getSchema, database, logger).catch(() => {
				/* errors logged inside ensure */
			});
		}
		return fieldReady;
	};

	init('app.before', async () => {
		await ensureOnce();
	});

	action('server.start', async () => {
		await ensureOnce();
	});

	filter('settings.read', async (payload: unknown, _meta: unknown, context: any) => {
		await ensureOnce();

		const accountability: Accountability | null = context?.accountability ?? null;
		if (accountability?.admin) {
			return payload;
		}

		const rows = getSettingsRows(payload);
		if (!rows?.length) return payload;

		const access = await resolveUserAccessContext(database, accountability);

		let stored: unknown = null;
		try {
			const dbRow = await database('directus_settings').select(SAVE_AND_STAY_FIELD).first();
			stored = dbRow?.[SAVE_AND_STAY_FIELD];
		} catch {
			stored = null;
		}

		const config = normalizeConfig(stored);
		const applicableRules = config.rules.filter((rule) => userMatchesRule(rule, access));

		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;
			row[SAVE_AND_STAY_FIELD] = {
				version: 1,
				rules: applicableRules,
			};
		}

		return payload;
	});

	filter('settings.update', async (payload: any, _meta: unknown, context: any) => {
		const accountability: Accountability | null = context?.accountability ?? null;
		if (accountability?.admin) {
			return payload;
		}

		if (payload && typeof payload === 'object' && SAVE_AND_STAY_FIELD in payload) {
			delete payload[SAVE_AND_STAY_FIELD];
		}

		return payload;
	});
});
