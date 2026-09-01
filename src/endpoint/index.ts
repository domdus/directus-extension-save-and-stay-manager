import type { Request, Response, NextFunction, Router } from 'express';
import { normalizeConfig, serializeConfig } from '../shared/evaluate';
import { SAVE_AND_STAY_FIELD } from '../shared/types';

type EndpointContext = {
	database: any;
	services: any;
	getSchema: () => Promise<any>;
};

function requireAdmin(req: Request, res: Response): boolean {
	const accountability = (req as any).accountability as
		| { admin?: boolean; admin_access?: boolean; role?: { admin_access?: boolean } | string | null }
		| null
		| undefined;
	if (!accountability) {
		res.status(403).json({ errors: [{ message: 'Admin access required' }] });
		return false;
	}
	const isAdmin =
		accountability.admin === true ||
		accountability.admin_access === true ||
		(typeof accountability.role === 'object' && accountability.role?.admin_access === true);
	if (!isAdmin) {
		res.status(403).json({ errors: [{ message: 'Admin access required' }] });
		return false;
	}
	return true;
}

function parseStoredJson(raw: unknown): unknown {
	if (typeof raw !== 'string') return raw;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed[0] !== '{' && trimmed[0] !== '[') return raw;
	try {
		return JSON.parse(trimmed);
	} catch {
		return raw;
	}
}

async function readSettingsRow(database: any): Promise<Record<string, any>> {
	try {
		const row = await database('directus_settings').select(SAVE_AND_STAY_FIELD).first();
		return row || {};
	} catch {
		return {};
	}
}

async function writeSettings(context: EndpointContext, data: Record<string, unknown>) {
	const row = await context.database('directus_settings').select('id').first();
	if (row?.id == null) {
		throw new Error('Settings row missing');
	}

	try {
		const schema = await context.getSchema();
		const { ItemsService } = context.services;
		const service = new ItemsService('directus_settings', {
			schema,
			knex: context.database,
			accountability: { admin: true },
		});
		await service.updateOne(row.id, data);
		return;
	} catch {
		await context.database('directus_settings').where({ id: row.id }).update(data);
	}
}

export default {
	id: 'save-and-stay-manager',
	handler: (router: Router, context: EndpointContext) => {
		/**
		 * Read save_and_stay via knex so Directus 11 / 12.2+ field allowlists
		 * cannot 403 the admin UI.
		 */
		router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!requireAdmin(req, res)) return;
				const row = await readSettingsRow(context.database);
				res.json({
					data: {
						[SAVE_AND_STAY_FIELD]: normalizeConfig(parseStoredJson(row[SAVE_AND_STAY_FIELD])),
					},
				});
			} catch (error) {
				next(error);
			}
		});

		router.patch('/config', async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!requireAdmin(req, res)) return;

				const body = (req.body?.data ?? req.body ?? {}) as Record<string, unknown>;
				if (!(SAVE_AND_STAY_FIELD in body)) {
					res.status(400).json({ errors: [{ message: 'Nothing to update' }] });
					return;
				}

				const patch = {
					[SAVE_AND_STAY_FIELD]: serializeConfig(body[SAVE_AND_STAY_FIELD] as any),
				};

				await writeSettings(context, patch);
				res.json({ data: patch });
			} catch (error) {
				next(error);
			}
		});
	},
};
