<template>
	<private-view title="Settings" icon="settings">
		<template #headline>
			<v-breadcrumb :items="[{ name: 'Save and Stay', to: '/save-and-stay-manager' }]" />
		</template>

		<template #navigation>
			<module-navigation />
		</template>

		<template #sidebar>
			<sidebar-detail icon="info" title="About" close>
				<p class="sidebar-text">
					Export or import this extension’s JSON config, or remove the dedicated settings field before
					uninstalling.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<p class="page-intro">
				Back up or restore rules as JSON, or remove the dedicated
				<code>{{ SAVE_AND_STAY_FIELD }}</code> settings field before uninstalling.
			</p>

			<v-divider
				class="section-divider"
				large
				:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
			>
				<template #icon><v-icon name="import_export" /></template>
				Export / Import
			</v-divider>

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
import { onMounted, ref } from 'vue';
import ModuleNavigation from './navigation.vue';
import { usePageClass } from './composables/use-page-class';
import { useSaveAndStayManager } from './composables/use-save-and-stay';

const pageClass = usePageClass();
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const importMessage = ref<{ type: 'success' | 'danger'; text: string } | null>(null);
const result = ref<{ type: 'success' | 'danger'; text: string } | null>(null);

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

.page-intro,
.explain {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.page-intro {
	margin-bottom: 24px;
}

.page-intro code,
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

.sidebar-text {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}
</style>
