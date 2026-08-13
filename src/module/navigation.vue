<template>
	<v-list nav>
		<v-list-item to="/save-and-stay-manager">
			<v-list-item-icon>
				<v-icon name="rule" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Rules" />
			</v-list-item-content>
		</v-list-item>

		<v-divider />

		<v-list-item to="/save-and-stay-manager/settings">
			<v-list-item-icon>
				<v-icon name="settings" />
			</v-list-item-icon>
			<v-list-item-content>
				<v-text-overflow text="Settings" />
			</v-list-item-content>
		</v-list-item>
	</v-list>
</template>

<script setup lang="ts"></script>
