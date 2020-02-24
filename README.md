Edtechhub
=================

[![Greenkeeper badge](https://badges.greenkeeper.io/edtechhub/zotero-edtechhub.svg)](https://greenkeeper.io/)

Install by downloading the [latest version](https://github.com/edtechhub/zotero-edtechhub/releases/latest)

# EdTech hub companion plugin for Zotero

This is a plugin for Zotero, developed by https://github.com/retorquere and https://github.com/bjohas for use by EdTech Hub staff. 

# Features of the plugin

## Right-click menu (on item)
- ETH Save item ID. Saves the item ID to a field in 'extra'
- ETH Save item details to note. Saves the current items metadata into a note. Helpful if a change in item type might lead to loss of information.
- ETH Cite (Author, Year). A kind of 'scannable cite' to use with Google Docs, format 1.
- ETH Cite Author (Year). A kind of 'scannable cite' to use with Google Docs, format 1.
- ETH Share citation. Sharing a citation (author, year, title) together with Zotero locations. We use this to share citations with each other e.g. on Slack or via Email.

## Right-click menu (on attachment)
- ETH Duplicate attachment. Duplicates an attachment, typically a PDF. This is useful if you'd like to keep a clear copy of the PDF prior to annotation.

## Other features

### Merges
The plugin affects item merges. When items are merged, the fields of each item prior to the merge are added to a note. Helpful if an merge has lead to loss of information.

### Warning if plugins aren't installed
We always use these plugins (for Zotero, at the EdTech Hub). The EdTech Hub plugin therefore warns the user if these are not installed:
- short-dois
- Zutilo
- ZotFile

### Notification while Zotero is getting ready.

There's some function (such as export, or the additional menu options) that don't show while Zotero is completing the startup. The plugin adds a warning that disappears when Zotero is fully loaded.

### Storing items IDs in extras

The reason we care about item IDs (and tracking them through merges, etc) is that that we can embed item ids into google docs. If item ids change, but the 'item id history' is preserved, then they can be updated. Embedded item ids turn into links to our public evidence library, available here https://docs.edtechhub.org (which uses https://github.com/edtechhub/eth-evidence-library-kerko).


# Reporting errors

When opening an issue:

* Go into `Help` - `Debug Output Logging` - `Restart with Logging Enabled...`
* Let Zotero restart
* Replicate the problem
* Go into `Help` - `Send EdTech hub debug log`
* Post the ID you get in the popup that follows

# About the EdTech Hub
Information about the EdTech Hub is available at https://edtechhub.org.
