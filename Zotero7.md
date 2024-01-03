I converted the plugin to bootstrapped. This has the side benefit that it can be installed/upgraded without restarting Zotero, but it's primarily because Zotero 7 demands it, and it is the easiest way to get 7/6 compatibility (if possible, which isn't always the case, but it is here).

There is an edge case on this compatibility -- Zotero 6 does not fully implement async bootstrap methods, so if the bootstrap shutdown must do cleanup, it will likely fail. But this plugin doesn't, and it's simpler this way. If the issue arises, I have a workaround (which I use for my own plugin).

The main changes are:

* I've added a loader (`bootstrap.ts`). This is mostly boilerplate, almost all Zotero 7 plugins will have code nearly indistinguishable from this.
* I've renamed `content/zotero-edtechhub.ts` to `lib.ts`
* Stuff that lived in `EdTechHubMain.constructor` and `EdTechHubMain.init` have been moved into `EdTechHubMain.startup`, which is called on startup.
* Overlays don't work anymore in Zotero 7, so the UI construction has been moved into `EdTechHubMain.ui`. This adds a convenience method to create XUL elements for the ui. These have a CSS class to mark them for removal if the ETH plugin is shut down/removed.
* Translations have been moved to `locale/en-US/zotero-edtechhub.ftl`. This is the new localization system for Zotero 7. It does not work for Zotero 6, so I've added a kludge; since the ETH plugin only has english translations anyway, I have the build bake the strings into the plugin. This will have to change in due time, but we can probably wait until Zotero 7 is GA and remove the kludge. Should it be necessary I have a way to load the strings for other languages, but this is simplest for now.
* Zotero 7 doesn't support resource: and skin: URLs anymore, so moved these both to content, which is still supported with the aom loader in bootstrap.ts

I think this is broadly it. Please go over the code and ask about things that are unclear. The easiest way to get an overview of what changed is to run a `git diff` between the `gh-88` branch and the `master` branch.
