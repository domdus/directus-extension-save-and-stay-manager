# Save and Stay Manager

Directus Studio extension that makes the **header Save** button run **Save and Stay** for selected collections, roles, and policies.

## Directus 12.2+ global setting

From **12.2.0**, Directus has a project **Default Save Action** (`save-and-quit` | `save-and-stay` | `save-and-create-new`). That is **global only** — not per collection or role.

Use this extension when you need **selective** Stay (collections × roles/policies):

1. Leave the project Default Save Action as **Save and Quit** (or unset).
2. Add rules here for who/what should Stay instead.

If the project default is already Stay, matching rules are a no-op (primary Save already stays; the Stay menu item is hidden).

## Extension type

**Bundle**

| Entry | Role |
|-------|------|
| Module | Rules + settings UI (admins) |
| Hook | Ensures `directus_settings.save_and_stay` exists |
| App enforcer | Hijacks header Save → native Save and Stay when a rule matches |

Supports **v11** (`more_vert` menu) and **v12** (split-menu chevron). No presentation fields required.

## Install

```bash
npm install
npm run build
```

Copy into your Directus `extensions/` folder (or npm-install there), restart Directus.

Enable **Save and Stay** under **Settings → Project Settings → Modules** if it is not visible.

## Configure

1. Open **Save and Stay** in the module bar.
2. **Add Rule** → pick collections (empty = all), roles/policies (empty = everyone).
3. Save.

Matching: **OR across rules**. Within a rule, audience is OR (any listed role or policy).

## How it works

Directus does not expose `saveAndStay()` to extensions. The enforcer captures the primary header Save click and triggers the native **Save and Stay** menu action (validation, relations, versions preserved). The split / `…` menu still offers other save actions.

## Uninstall

Use **Settings → Remove extension data** in the module (or delete `directus_settings.save_and_stay`), then remove the extension package.

## License

MIT
