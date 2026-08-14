<template>
	<private-view title="Rules" icon="save">
		<template #headline>
			<v-breadcrumb :items="[{ name: 'Save and Stay', to: '/save-and-stay-manager' }]" />
		</template>

		<template #navigation>
			<module-navigation />
		</template>

		<template #actions>
			<v-button v-tooltip.bottom="'Save'" :disabled="!hasEdits" :loading="saving" icon rounded @click="save">
				<v-icon name="check" />
			</v-button>
		</template>

		<template #sidebar>
			<sidebar-detail icon="info" title="About" close>
				<p class="sidebar-text">
					Rules make the header Save button run <strong>Save and Stay</strong> instead of leaving the item
					page. Match is OR across rules. Within a rule: empty collections = all collections; empty roles and
					policies = everyone.
				</p>
			</sidebar-detail>
		</template>

		<div :class="pageClass">
			<div v-if="loading" class="loading">
				<v-progress-circular indeterminate />
			</div>

			<template v-else>
				<v-divider
					class="section-divider"
					large
					:style="{ '--v-divider-color': 'var(--theme--border-color-subdued)' }"
				>
					<template #icon><v-icon name="save" /></template>
					Rules
				</v-divider>

				<p class="page-intro">
					Add rules for the collections (and optional roles/policies) that should stay on the item after
					Save. Unlisted combinations keep the default Save and Quit behavior.
				</p>

				<div v-if="configuredRules.length === 0" class="empty">No rules yet.</div>

				<div v-else class="list">
					<v-list-item
						v-for="rule in configuredRules"
						:key="rule.id"
						block
						dense
						clickable
						class="rule-row"
						@click="openRuleEditor(rule.id)"
					>
						<v-icon class="icon" name="save" />
						<div class="info">
							<div class="name">{{ ruleTitle(rule) }}</div>
							<div class="meta">{{ ruleSummary(rule) }}</div>
						</div>
						<div class="row-actions" @click.stop>
							<v-button v-tooltip="'Edit'" icon x-small secondary @click="openRuleEditor(rule.id)">
								<v-icon name="edit" />
							</v-button>
							<v-button v-tooltip="'Remove'" icon x-small secondary @click="removeRule(rule.id)">
								<v-icon name="close" />
							</v-button>
						</div>
					</v-list-item>
				</div>

				<v-button class="add-link" @click="openRuleEditor('+')">Add Rule</v-button>
			</template>
		</div>

		<v-drawer
			:model-value="ruleEditingId !== null"
			:title="ruleEditingId === '+' ? 'Add Rule' : 'Edit Rule'"
			icon="save"
			@update:model-value="onRuleDrawerToggle"
			@cancel="closeRuleEditor"
		>
			<template #actions>
				<v-button
					v-tooltip.bottom="'Apply'"
					:disabled="ruleSaveDisabled"
					icon
					rounded
					@click="saveRuleDraft"
				>
					<v-icon name="check" />
				</v-button>
			</template>

			<div v-if="ruleDraft" class="drawer-content">
				<p class="hint">
					Leave collections empty to apply to all content collections. Leave roles and policies empty to apply
					for everyone. Otherwise match is OR (any listed role or policy).
				</p>

				<div class="field">
					<label>Name (optional)</label>
					<v-input v-model="ruleDraft.name" placeholder="Editors — Articles" />
				</div>

				<div class="field">
					<label>Collections</label>
					<v-select
						v-model="ruleDraft.collections"
						multiple
						:items="collectionOptions"
						item-text="text"
						item-value="value"
						placeholder="All collections (leave empty)"
					/>
				</div>

				<div class="field-row">
					<div class="field">
						<label>Roles</label>
						<v-select
							v-model="ruleDraft.roles"
							multiple
							:items="roleOptions"
							item-text="text"
							item-value="value"
							placeholder="Everyone (leave empty)"
						/>
					</div>

					<div class="field">
						<label>Policies</label>
						<v-select
							v-model="ruleDraft.policies"
							multiple
							:items="policyOptions"
							item-text="text"
							item-value="value"
							placeholder="Optional (Directus 11+)"
						/>
					</div>
				</div>
			</div>
		</v-drawer>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ModuleNavigation from './navigation.vue';
import { usePageClass } from './composables/use-page-class';
import { useSaveAndStayManager } from './composables/use-save-and-stay';

const pageClass = usePageClass();

const {
	loading,
	saving,
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
} = useSaveAndStayManager();

onMounted(() => {
	void ensureLoaded();
});
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

.loading {
	display: flex;
	justify-content: center;
	padding: 48px 0;
}

.section-divider {
	margin-bottom: 12px;
}

.page-intro {
	margin: 0 0 24px;
	line-height: 1.55;
	color: var(--theme--foreground);
}

.empty {
	padding: 16px 0;
	color: var(--theme--foreground-subdued);
}

.list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.rule-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.icon {
	flex-shrink: 0;
	margin: 0 0.6875rem;
}

.info {
	flex: 1;
	min-width: 0;
}

.name {
	font-weight: 600;
}

.meta {
	font-size: 12px;
	color: var(--theme--foreground-subdued, var(--foreground-subdued, #a2b5cd));
}

.row-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
}

.add-link {
	margin-top: 16px;
}

.drawer-content {
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.hint {
	margin: 0;
	color: var(--theme--foreground-subdued);
	line-height: 1.4;
	font-size: 13px;
}

.field label {
	display: block;
	margin-bottom: 6px;
	font-weight: 600;
}

.field-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
	align-items: start;
}

@media (max-width: 520px) {
	.field-row {
		grid-template-columns: 1fr;
	}
}


.sidebar-text {
	margin: 0 0 16px;
	line-height: 1.55;
	color: var(--theme--foreground);
}
</style>
