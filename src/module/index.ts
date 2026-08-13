import { defineModule } from '@directus/extensions-sdk';
import { userHasAdminAccess } from '../shared/admin';
import RulesView from './rules-view.vue';
import SettingsView from './settings-view.vue';
import { installSaveEnforcer } from './save-enforcer';

// App extension loads for every Studio session — install header Save hijack globally.
installSaveEnforcer();

export default defineModule({
	id: 'save-and-stay-manager',
	name: 'Save and Stay',
	icon: 'save',
	routes: [
		{
			path: '',
			component: RulesView,
		},
		{
			path: 'settings',
			component: SettingsView,
		},
	],
	preRegisterCheck(user) {
		return userHasAdminAccess(user);
	},
});
