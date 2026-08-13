import { defineHook } from '@directus/extensions-sdk';
import { EMPTY_SAVE_AND_STAY, SAVE_AND_STAY_FIELD } from '../shared/types';

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
					note: 'Managed by Save and Stay Manager. Do not edit manually.',
				},
				schema: {
					default_value: JSON.stringify(EMPTY_SAVE_AND_STAY),
				},
			});

			logger.info(`[save-and-stay-manager] Created directus_settings.${SAVE_AND_STAY_FIELD}`);
		}
	} catch (error: any) {
		const message = String(error?.message || error || '');
		if (/already exists|duplicate|SQLITE_ERROR/i.test(message)) {
			logger.warn(`[save-and-stay-manager] Field ensure skipped: ${message}`);
			return;
		}

		logger.error(`[save-and-stay-manager] Failed to ensure field: ${message}`);
	}
}

export default defineHook(({ init }, { services, database, getSchema, logger }) => {
	init('app.before', async () => {
		await ensureSaveAndStayField(services, getSchema, database, logger);
	});

	init('routes.custom.after', async () => {
		await ensureSaveAndStayField(services, getSchema, database, logger);
	});
});
