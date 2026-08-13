/**
 * Bridge into Directus Studio's native "Save and Stay" action.
 *
 * Works across Studio layouts:
 * - v11.x: check button + more_vert SaveOptions menu
 * - v12.x: PrivateViewHeaderBarActionButton + split-menu (keyboard_arrow_down)
 *
 * Save handlers live inside item.vue and are not exposed to extensions.
 */

const HEADER_ACTIONS_SELECTORS = [
	'#app header .actions',
	'#app .private-view header .actions',
	'#app .actions',
];
const MENU_OUTLET = '#menu-outlet';
const DIALOG_OUTLET = '#dialog-outlet';
const HIJACK_FLAG = 'data-sas-hijack';

/** Common translations / phrases for the stay action */
const STAY_PATTERNS = [
	/save\s*(and|&)\s*stay/i,
	/speichern\s*(und|&)\s*bleiben/i,
	/enregistrer\s*(et|&)\s*rester/i,
	/guardar\s*(y|&)\s*permanecer/i,
	/opslaan\s*(en|&)\s*blijven/i,
	/salvar\s*(e|&)\s*permanecer/i,
	/salva\s*(e|&)\s*rimani/i,
	/\bstay\b/i,
	/\bbleiben\b/i,
];

export type SaveBridgeResult = 'ok' | 'busy' | 'blocked' | 'not-found' | 'timeout';

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function findHeaderActions(): HTMLElement | null {
	for (const selector of HEADER_ACTIONS_SELECTORS) {
		const el = document.querySelector<HTMLElement>(selector);
		if (el) return el;
	}
	return null;
}

export function isOverlayBlocking(): boolean {
	const dialog = document.querySelector(DIALOG_OUTLET);
	if (dialog && dialog.childElementCount > 0) return true;

	if (document.querySelector('.v-drawer.api, .v-drawer.open, .v-drawer[data-active="true"]')) {
		return true;
	}

	return false;
}

function isSplitMenuControl(el: HTMLElement): boolean {
	if (el.classList.contains('split-menu-button')) return true;
	if (el.closest('.split-menu-button')) return true;
	const icon = el.getAttribute('data-icon') || el.querySelector?.('[data-icon]')?.getAttribute('data-icon');
	return icon === 'keyboard_arrow_down' || icon === 'arrow_drop_down';
}

export function findPrimarySaveButton(): HTMLElement | null {
	const actions = findHeaderActions();
	if (!actions) return null;

	const byClass = actions.querySelector<HTMLElement>('.action-save, button.action-save, .header-button');
	if (byClass && !isSplitMenuControl(byClass) && byClass.querySelector('[data-icon="check"], [data-icon="beenhere"]')) {
		return byClass;
	}

	// Prefer primary slot (v12 header bar)
	const primaryScope = actions.querySelector('.primary') || actions;

	const candidates = [...primaryScope.querySelectorAll<HTMLElement>('button')].filter((btn) => {
		if (isSplitMenuControl(btn)) return false;
		if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
			/* still a candidate — may be disabled when no edits */
		}
		return Boolean(btn.querySelector('[data-icon="check"], [data-icon="beenhere"]'));
	});

	// Last check button in primary area is usually Save (archive/etc. may precede it)
	return candidates.at(-1) ?? null;
}

export function isPrimarySaveDisabled(): boolean {
	const btn = findPrimarySaveButton();
	if (!btn) return true;
	return btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
}

function findSaveMenuActivator(): HTMLElement | null {
	const actions = findHeaderActions();
	if (!actions) return null;

	const saveBtn = findPrimarySaveButton();
	const scope = saveBtn?.parentElement || actions.querySelector('.primary') || actions;

	// v12+: split-menu chevron beside Save
	const split = scope.querySelector<HTMLElement>('.split-menu-button');
	if (split) return split;

	const splitIcon = scope.querySelector<HTMLElement>('[data-icon="keyboard_arrow_down"]');
	if (splitIcon) return splitIcon.closest('button') || splitIcon;

	// v11: more_vert SaveOptions activator
	const moreVert = scope.querySelector<HTMLElement>('[data-icon="more_vert"]');
	if (moreVert) return moreVert.closest('button, .v-icon, span') || moreVert;

	const activators = [...actions.querySelectorAll<HTMLElement>('.v-menu-activator, [class*="menu-activator"]')];
	const scored = activators
		.map((el) => {
			const icon = el.querySelector('[data-icon]')?.getAttribute('data-icon') ?? '';
			const nearSave =
				saveBtn && (el.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 ? 2 : 0;
			const iconScore =
				icon === 'more_vert' || icon === 'expand_more' || icon === 'arrow_drop_down' || icon === 'keyboard_arrow_down'
					? 3
					: 0;
			return { el, score: nearSave + iconScore };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored[0]?.el ?? null;
}

function listMenuItems(): HTMLElement[] {
	const outlet = document.querySelector(MENU_OUTLET);
	if (!outlet) return [];
	return [...outlet.querySelectorAll<HTMLElement>('.v-list-item, [role="menuitem"], li.v-list-item')];
}

function scoreStayItem(el: HTMLElement): number {
	const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
	let score = 0;

	for (const pattern of STAY_PATTERNS) {
		if (pattern.test(text)) {
			score += 5;
			break;
		}
	}

	const icon = el.querySelector('[data-icon]')?.getAttribute('data-icon');
	// On v12.2+, stay uses check; quit uses arrow_back — prefer check + stay text
	if (icon === 'check') score += 2;
	if (icon === 'arrow_back') score -= 3;

	if (el.classList.contains('link') || el.classList.contains('clickable')) score += 1;

	return score;
}

export function findSaveAndStayMenuItem(): HTMLElement | null {
	const items = listMenuItems();
	if (items.length === 0) return null;

	const ranked = items
		.map((el) => ({ el, score: scoreStayItem(el) }))
		.filter((x) => x.score >= 5)
		.sort((a, b) => b.score - a.score);

	return ranked[0]?.el ?? null;
}

async function waitForMenuItem(timeoutMs = 1500): Promise<HTMLElement | null> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const item = findSaveAndStayMenuItem();
		if (item) return item;
		await sleep(40);
	}

	return null;
}

/**
 * Open the header save menu and click native Save and Stay.
 */
export async function triggerNativeSaveAndStay(): Promise<SaveBridgeResult> {
	if (isOverlayBlocking()) return 'blocked';
	if (isPrimarySaveDisabled()) return 'busy';

	const activator = findSaveMenuActivator();
	if (!activator) return 'not-found';

	activator.click();

	const item = await waitForMenuItem();
	if (!item) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		return 'timeout';
	}

	item.click();
	return 'ok';
}

export function observePrimarySaveDisabled(onChange: (disabled: boolean) => void): () => void {
	const actions = findHeaderActions();
	if (!actions) {
		onChange(true);
		return () => undefined;
	}

	const emit = () => onChange(isPrimarySaveDisabled());
	emit();

	const observer = new MutationObserver(emit);
	observer.observe(actions, {
		subtree: true,
		attributes: true,
		attributeFilter: ['disabled', 'aria-disabled', 'class'],
		childList: true,
	});

	return () => observer.disconnect();
}

function isEventOnPrimarySave(event: Event): boolean {
	const saveBtn = findPrimarySaveButton();
	if (!saveBtn || !(event.target instanceof Node)) return false;

	const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
	const hitActivator = path.some((node) => {
		if (!(node instanceof HTMLElement)) return false;
		if (node.classList.contains('split-menu-button') || node.closest('.split-menu-button')) return true;
		if (node.classList.contains('v-menu-activator') || node.closest('.v-menu-activator')) return true;
		const icon = node.getAttribute('data-icon');
		return (
			icon === 'more_vert' ||
			icon === 'expand_more' ||
			icon === 'arrow_drop_down' ||
			icon === 'keyboard_arrow_down'
		);
	});

	if (hitActivator) return false;

	return saveBtn === event.target || saveBtn.contains(event.target);
}

function annotateSaveButton(tooltip: string) {
	const btn = findPrimarySaveButton();
	if (!btn) return;

	btn.setAttribute(HIJACK_FLAG, '1');
	btn.setAttribute('title', tooltip);
	btn.setAttribute('aria-label', tooltip);
}

/**
 * Capture-phase click hijack: primary header Save runs native Save and Stay
 * instead of Save and Quit.
 */
export function installHeaderSaveHijack(options?: {
	tooltip?: string;
	onResult?: (result: SaveBridgeResult) => void;
}): () => void {
	const tooltip = options?.tooltip ?? 'Save and Stay';
	let inflight = false;

	const onClickCapture = async (event: Event) => {
		if (!isEventOnPrimarySave(event)) return;
		if (isOverlayBlocking()) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		if (inflight || isPrimarySaveDisabled()) return;

		inflight = true;
		try {
			const result = await triggerNativeSaveAndStay();
			options?.onResult?.(result);
		} finally {
			inflight = false;
		}
	};

	document.addEventListener('click', onClickCapture, true);

	annotateSaveButton(tooltip);

	const actions = findHeaderActions();
	const observer = actions
		? new MutationObserver(() => {
				annotateSaveButton(tooltip);
			})
		: null;

	observer?.observe(actions!, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['title', 'aria-label', 'disabled'],
	});

	return () => {
		document.removeEventListener('click', onClickCapture, true);
		observer?.disconnect();

		const btn = findPrimarySaveButton();
		if (btn?.getAttribute(HIJACK_FLAG) === '1') {
			btn.removeAttribute(HIJACK_FLAG);
			btn.removeAttribute('title');
			btn.removeAttribute('aria-label');
		}
	};
}
