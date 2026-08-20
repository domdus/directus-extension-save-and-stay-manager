<template>
	<private-view title="Settings" icon="settings">
		<template #headline>
			<v-breadcrumb :items="[{ name: 'Save and Stay', to: '/save-and-stay-manager' }]" />
		</template>

		<template #navigation>
			<module-navigation />
		</template>

		<template #sidebar>
			<sidebar-detail id="about" icon="info" title="About">
				<p class="sidebar-text">
					Export or import this extension’s JSON config, or remove the dedicated settings field before
					uninstalling.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<v-divider
				class="section-divider"
				large
				:inline-title="false"
				:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
			>
				<template #icon><v-icon name="system_update" /></template>
				Extension Updates
			</v-divider>
			<p class="explain">
				Check npm for the latest published version and compare it with the installed extension version.
			</p>
			<div class="actions">
				<v-button secondary :loading="checkingUpdates" @click="checkUpdates">Check now</v-button>
			</div>
			<p class="links">
				<a :href="EXTENSION_NPM_URL" target="_blank" rel="noopener noreferrer">npm</a>
				·
				<a :href="EXTENSION_GITHUB_URL" target="_blank" rel="noopener noreferrer">GitHub</a>
				<template v-if="marketplaceUrl">
					·
					<a :href="marketplaceUrl">Marketplace</a>
				</template>
			</p>
			<div v-if="updateInfo" class="result">
				<v-notice :type="updateNoticeType">
					Current: <strong>{{ updateInfo.current_version }}</strong>
					<template v-if="updateInfo.latest_version">
						· Latest: <strong>{{ updateInfo.latest_version }}</strong>
					</template>
					<template v-if="updateInfo.error"> · {{ updateInfo.error }}</template>
					<template v-else-if="updateInfo.has_update"> · Update available</template>
					<template v-else> · Up to date</template>
				</v-notice>
			</div>

			<v-divider
				class="section-divider"
				large
				:inline-title="false"
				:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
			>
				<template #icon><v-icon name="import_export" /></template>
				Export / Import
			</v-divider>
			<p class="explain">
				Back up or restore rules as JSON, or remove the dedicated
				<code>{{ SAVE_AND_STAY_FIELD }}</code> settings field before uninstalling.
			</p>

			<div class="actions">
				<v-button secondary :disabled="loading || cleaning" @click="exportConfig">Export JSON</v-button>
				<v-button
					secondary
					:disabled="loading || cleaning || importing"
					:loading="importing"
					@click="triggerImport"
				>
					Import JSON
				</v-button>
				<input
					ref="fileInput"
					type="file"
					accept="application/json,.json"
					class="file-input"
					@change="onImportFile"
				/>
			</div>

			<div v-if="importMessage" class="result">
				<v-notice :type="importMessage.type">{{ importMessage.text }}</v-notice>
			</div>

			<v-divider
				class="section-divider add-margin-top"
				large
				:inline-title="false"
				:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
			>
				<template #icon><v-icon name="delete" /></template>
				Remove extension data
			</v-divider>

			<p class="explain">
				Rules live in <code>directus_settings.{{ SAVE_AND_STAY_FIELD }}</code>. Cleanup removes only that field.
				If the extension stays installed, the next Directus restart may recreate an empty field.
			</p>

			<v-notice type="warning" class="notice">
				Deleting extension data cannot be undone. Export first if you might need the config again.
			</v-notice>

			<div v-if="result" class="result">
				<v-notice :type="result.type">{{ result.text }}</v-notice>
			</div>

			<v-button kind="danger" :loading="cleaning" :disabled="loading" @click="runCleanup">
				Remove extension data
			</v-button>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk';
import { computed, onMounted, ref } from 'vue';
import ModuleNavigation from './navigation.vue';
import { usePageClass } from './composables/use-page-class';
import { useSaveAndStayManager } from './composables/use-save-and-stay';
import {
	EXTENSION_GITHUB_URL,
	EXTENSION_MARKETPLACE_UID,
	EXTENSION_NPM_URL,
	EXTENSION_PACKAGE_NAME,
} from '../shared/extension-meta';

const api = useApi();
const pageClass = usePageClass();
const marketplaceUrl = computed(() =>
	EXTENSION_MARKETPLACE_UID
		? `/admin/settings/marketplace/extension/${EXTENSION_MARKETPLACE_UID}`
		: null,
);
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const importMessage = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const result = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const checkingUpdates = ref(false);
const updateInfo = ref<{
	current_version: string;
	latest_version: string | null;
	has_update: boolean;
	checked_at: string;
	error?: string;
	links: { npm: string; github: string; marketplace: string | null };
} | null>(null);
const updateNoticeType = computed(() => {
	if (!updateInfo.value) return 'info';
	if (updateInfo.value.error) return 'warning';
	return updateInfo.value.has_update ? 'warning' : 'success';
});

const {
	loading,
	cleaning,
	ensureLoaded,
	exportConfig,
	importConfig,
	cleanupExtensionData,
	SAVE_AND_STAY_FIELD,
} = useSaveAndStayManager();

onMounted(() => {
	void ensureLoaded();
});

function normalizeVersion(raw: string): string {
	return String(raw || '').trim().replace(/^v/, '');
}

function versionFromExtensionEntry(entry: any): string | null {
	const version = entry?.version || entry?.schema?.version || entry?.meta?.version;
	return version ? String(version) : null;
}

function findInstalledVersion(entries: any[]): string {
	const stack = [...entries];
	while (stack.length) {
		const entry = stack.pop();
		if (!entry || typeof entry !== 'object') continue;
		const name = entry.name || entry.schema?.name || entry.id;
		if (name === EXTENSION_PACKAGE_NAME) {
			return versionFromExtensionEntry(entry) || 'unknown';
		}
		if (Array.isArray(entry.entries)) stack.push(...entry.entries);
		if (Array.isArray(entry.children)) stack.push(...entry.children);
	}
	return 'unknown';
}

async function readInstalledVersion(): Promise<string> {
	try {
		const res = await api.get('/extensions');
		const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
		return findInstalledVersion(list);
	} catch {
		return 'unknown';
	}
}

function compareSemver(a: string, b: string): number {
	const toNums = (v: string) => normalizeVersion(v).split('.').map((x) => parseInt(x, 10) || 0);
	const av = toNums(a);
	const bv = toNums(b);
	const len = Math.max(av.length, bv.length, 3);
	for (let i = 0; i < len; i++) {
		const l = av[i] ?? 0;
		const r = bv[i] ?? 0;
		if (l > r) return 1;
		if (l < r) return -1;
	}
	return 0;
}

async function checkUpdates() {
	checkingUpdates.value = true;
	const marketplace = marketplaceUrl.value;
	const current = normalizeVersion(await readInstalledVersion());
	try {
		const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(EXTENSION_PACKAGE_NAME)}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) throw new Error(`npm registry request failed (${res.status})`);
		const json = (await res.json()) as { 'dist-tags'?: Record<string, string> };
		const latest = normalizeVersion(json?.['dist-tags']?.latest || '');
		if (!latest) throw new Error('No latest version found');
		updateInfo.value = {
			current_version: current,
			latest_version: latest,
			has_update: compareSemver(latest, current) > 0,
			checked_at: new Date().toISOString(),
			links: { npm: EXTENSION_NPM_URL, github: EXTENSION_GITHUB_URL, marketplace },
		};
	} catch (error: any) {
		updateInfo.value = {
			current_version: current,
			latest_version: null,
			has_update: false,
			checked_at: new Date().toISOString(),
			error: error?.message || 'Update check failed',
			links: { npm: EXTENSION_NPM_URL, github: EXTENSION_GITHUB_URL, marketplace },
		};
	} finally {
		checkingUpdates.value = false;
	}
}

function triggerImport() {
	importMessage.value = null;
	fileInput.value?.click();
}

async function onImportFile(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;

	importing.value = true;
	try {
		await importConfig(file);
		importMessage.value = { type: 'success', text: 'Imported. Click Save on the Rules page to persist.' };
	} catch (error: any) {
		importMessage.value = {
			type: 'danger',
			text: error?.message || 'Import failed',
		};
	} finally {
		importing.value = false;
	}
}

async function runCleanup() {
	result.value = null;
	try {
		const outcome = await cleanupExtensionData();
		result.value = {
			type: 'success',
			text: `Cleared value: ${outcome.clearedValue ? 'yes' : 'no'}; deleted field: ${outcome.deletedField ? 'yes' : 'no'}.`,
		};
	} catch (error: any) {
		result.value = { type: 'danger', text: error?.message || 'Cleanup failed' };
	}
}
</script>

<style scoped>
.page {
	padding: var(--content-padding);
	padding-block-end: var(--content-padding-bottom);
	max-width: 720px;
}

.page--flush-top {
	padding-block-start: 0;
}

.explain {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.explain code {
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	font-size: 0.9em;
}

.section-divider {
	margin-bottom: 12px;
}

.section-divider.add-margin-top {
	margin-top: 40px;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 12px;
}

.file-input {
	display: none;
}

.notice,
.result {
	margin: 12px 0;
}

.links {
	margin: 8px 0 0;
	font-size: 13px;
}

.sidebar-text {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}
</style>
