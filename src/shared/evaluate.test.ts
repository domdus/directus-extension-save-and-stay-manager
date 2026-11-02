import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeConfig, ruleCoversCollection, shouldSaveAndStay, userMatchesRule } from './evaluate';

const context = { roleIds: ['r1'], policyIds: ['p1'] };

test('normalizeConfig tolerates junk and drops rules without an id', () => {
	assert.deepEqual(normalizeConfig(null).rules, []);
	assert.deepEqual(normalizeConfig('not json').rules, []);
	const config = normalizeConfig({ rules: [{ collections: ['a'] }, null, { id: 'x', roles: ['r1', 'r1', ' '] }] });
	assert.equal(config.rules.length, 1);
	assert.deepEqual(config.rules[0]?.roles, ['r1']);
});

test('a rule with no audience applies to everyone', () => {
	assert.equal(userMatchesRule({ roles: [], policies: [] }, context), true);
	assert.equal(userMatchesRule({ roles: ['other'], policies: [] }, context), false);
	assert.equal(userMatchesRule({ roles: [], policies: ['p1'] }, context), true);
});

test('empty collections cover all collections', () => {
	assert.equal(ruleCoversCollection({ collections: [] }, 'a'), true);
	assert.equal(ruleCoversCollection({ collections: ['b'] }, 'a'), false);
});

test('shouldSaveAndStay needs one matching rule', () => {
	const config = { version: 1 as const, rules: [{ id: '1', collections: ['a'], roles: ['r1'], policies: [] }] };
	assert.equal(shouldSaveAndStay(config, 'a', context), true);
	assert.equal(shouldSaveAndStay(config, 'b', context), false);
	assert.equal(shouldSaveAndStay(config, null, context), false);
});
