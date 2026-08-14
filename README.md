# Save and Stay Manager

Make the **header Save** button keep editors on the item page (**Save and Stay**) — for the collections and people you choose, not for everyone at once.

<img alt="Save and Stay Manager — rules list" src="https://raw.githubusercontent.com/domdus/directus-extension-save-and-stay-manager/main/docs/save-and-stay-manager.png" width="800" />

Open **Save and Stay** from the module bar (admins). Add rules for collections and optional roles or policies. Unmatched cases keep the normal **Save and Quit** behavior.

## Why

Editors often want **Save and Stay** as the default instead of leaving the item after every save. That request has been discussed in Directus for years ([discussion #4081](https://github.com/directus/directus/discussions/4081)), and community extensions mostly solve it as a **field interface**: you drop a special field onto each collection’s form.

That works for one or two models — not when you have dozens or a hundred collections. You would have to add (and maintain) the same presentation field on every form. It also does not give you **rules per role or policy** (for example: editors Stay on articles, but admins still Quit).

This extension keeps configuration in **one place**: pick collections and who the rule applies to. No fields to add to each collection model. And unlike the global project setting (below), you can still target **roles and policies**.

## Directus 12.2+ global setting

From **12.2.0**, Directus finally has a project **Default Save Action** (`save-and-quit` | `save-and-stay` | `save-and-create-new`). That is **global only** — not per collection or role.

Use this extension when you need **selective** Stay (collections × roles/policies):

1. Leave the project Default Save Action as **Save and Quit** (or unset).
2. Add rules here for who/what should Stay instead.

If the project default is already Stay, matching rules are a no-op (primary Save already stays; the Stay menu item is hidden).

## Installation

Supports **Directus 9.26+ through 12.x**.

### npm

```bash
npm install directus-extension-save-and-stay-manager
```

Place the package in your Directus `extensions` folder (or install into a project that loads extensions from `node_modules`), then restart Directus.

### Marketplace

Search for **Save and Stay Manager** in **Settings → Marketplace**.

### Manual installation

1. Install and build:

```bash
cd directus-extension-save-and-stay-manager
npm install
npm run build
```

2. Copy the built package into your Directus `extensions` folder (include `package.json` and the `dist` folder).

3. Restart Directus.

4. In the Data Studio:

   1. Open **Settings → Project Settings → Modules**  
   2. Enable **Save and Stay**  
   3. Open **Save and Stay** from the left bar

## Configure

1. Open **Save and Stay** in the module bar.
2. **Add Rule** → pick collections (empty = all), roles/policies (empty = everyone).
3. Save.

Matching: **OR across rules**. Within a rule, audience is OR (any listed role or policy).

## How it works

Directus does not expose item save handlers to extensions, so this module works through the Studio UI — like a user would.

When you are on an item page and a rule matches your collection and role or policy, it finds the header **Save** button (by icon, label, or layout; Directus changed this between v11 and v12) and intercepts the click before the default **Save and Quit** handler runs. Instead, it opens the save dropdown (the chevron or ⋯ menu next to Save), selects **Save and Stay** (including translated labels), and clicks that. Validation, relations, and versions stay on Directus’s native path — only the target action changes.

The chevron or ⋯ menu is left alone, so **Save and Quit** and other options still work from there. The hijack turns off when no rule matches, when a dialog is open, when Save is disabled, or on Directus 12.2+ when the project default is already **Save and Stay**. Because this relies on Studio DOM structure rather than a public API, it is version-aware and may need updates if Directus changes the header layout.

## Uninstall

Use **Settings → Remove extension data** in the module (or delete the dedicated project setting this extension stores), then remove the extension package.

## License

MIT
