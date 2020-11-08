declare const Zotero: any
declare const Components: any

Components.utils.import('resource://gre/modules/osfile.jsm')
declare const OS: any

import sanitize_filename = require('sanitize-filename')

const marker = 'EdTechHubMonkeyPatched'
function $patch$(object, method, patcher) {
  if (object[method][marker]) return
  object[method] = patcher(object[method])
  object[method][marker] = true
}

function flash(title, body = null, timeout = 8) {
  try {
    const pw = new Zotero.ProgressWindow()
    pw.changeHeadline(`EdTech Hub: ${title}`)
    if (!body) body = title
    if (Array.isArray(body)) body = body.join('\n')
    pw.addDescription(body)
    pw.show()
    pw.startCloseTimer(timeout * 1000) // tslint:disable-line:no-magic-numbers
  } catch (err) {
    debug(`@flash failed: ${JSON.stringify({title, body})}`, err)
  }
}

const prefix = 'EdTechHub.ItemAlsoKnownAs:'

function libraryKey(item) {
  return Zotero.URI.getLibraryPath(item.libraryID || Zotero.Libraries.userLibraryID).replace(/.*\//, '')
}

function isShortDOI(ShortDOI) { // tslint:disable-line:variable-name
  return ShortDOI.match(/^10\/[a-z0-9]+$/)
}

function toClipboard(text) {
  const clipboard = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard)
  const transferable = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable)

  const mimetype = 'text/unicode'

  const str = Components.classes['@mozilla.org/supports-string;1'].createInstance(Components.interfaces.nsISupportsString)
  str.data = text
  transferable.addDataFlavor(mimetype)
  transferable.setTransferData(mimetype, str, text.length * 2)

  clipboard.setData(transferable, null, Components.interfaces.nsIClipboard.kGlobalClipboard)
}

async function put(url, body) {
  if (await OS.File.exists(OS.Path.join(Zotero.EdTechHub.dir, 'enable.txt'))) {
    const path = OS.Path.join(Zotero.EdTechHub.dir, url.split('/').reverse()[0])
    await Zotero.File.putContentsAsync(path, body)
    return path
  }

  const response = await fetch(url, { method: 'PUT', body })
  return await response.text()
}

function translate(items, translator) { // returns a promise
  const deferred = Zotero.Promise.defer()
  const translation = new Zotero.Translate.Export()
  translation.setItems(items)
  translation.setTranslator(translator)
  translation.setDisplayOptions({ exportNotes: false })
  translation.setHandler('done', (obj, success) => {
    if (success) {
      deferred.resolve(obj ? obj.string : '')
    } else {
      debug(`translate with ${translator} failed`, { message: 'undefined' })
      deferred.resolve('')
    }
  })
  translation.translate()
  return deferred.promise
}

async function asRIS(items) {
  if (!Array.isArray(items)) items = [ items ]

  return await translate(items, '32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7') // RIS
}

function itemKey(uri) {
  const m = uri.match(/^http:\/\/zotero.org\/(?:users|groups)\/(?:local\/)?(\w+)\/items\/(\w+)$/)
  if (!m) return null
  return `${m[1]}:${m[2]}`
}

function getRelations(item, alsoKnownAs: AlsoKnownAs) {
  const itemRelations = item.getRelations()
  for (let relations of [itemRelations['dc:replaces'], itemRelations['owl:sameAs']]) {
    if (typeof relations === 'string') relations = [ relations ]
    if (!Array.isArray(relations)) continue

    for (const uri of relations) {
      alsoKnownAs.add(itemKey(uri))
    }
  }
}

$patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
  let alsoKnownAs: AlsoKnownAs = null
  let history: string = null

  try {
    alsoKnownAs = Zotero.EdTechHub.getAlsoKnownAs(item)
    // preserve AlsoKnownAs of all merged items
    getRelations(item, alsoKnownAs)
    for (const otherItem of otherItems) {
      for (const id of Zotero.EdTechHub.getAlsoKnownAs(otherItem)) {
        alsoKnownAs.add(id)
      }
      getRelations(otherItem, alsoKnownAs)
    }
    debug(`merge-alsoKnownAs: post alsoKnownAs = ${alsoKnownAs.toString()} = ${item.getField('extra')}`)

    // keep RIS copy of all merged items
    const ris = await asRIS([item, ...otherItems])

    let user = Zotero.Prefs.get('sync.server.username')
    user = user ? `${user}, ` : ''

    history = `<div><b>Item history (${user}${new Date})</b></div>\n`
    history += `<pre>${Zotero.Utilities.text2html(ris)}</pre>\n`
    history += '<div>\n'
    history += `<p>group:</td><td>${libraryKey(item)}</p>\n`
    history += `<p>itemKey:</td><td>${item.key}</p>\n`
    history += `<p>itemKeyOld:</td><td>${otherItems.map(i => i.key).join(', ')}</p>\n`
    history += '</div>\n'
  } catch (err) {
    debug('merge-alsoKnownAs: error=', err)
  }

  debug('merge-alsoKnownAs: merging...')
  const merged = await original.apply(this, arguments)

  try {
    if (alsoKnownAs?.changed()) {
      Zotero.EdTechHub.setAlsoKnownAs(item, alsoKnownAs)
      await item.saveTx()
    }
    if (history) {
      const note = new Zotero.Item('note')
      note.libraryID = item.libraryID
      note.setNote(history)
      note.parentKey = item.key
      await note.saveTx()
      debug('merge-alsoKnownAs: note saved')
    }
  } catch (err) {
    debug('merge-alsoKnownAs: error=', err)
  }

  return merged
})

function debug(msg, err = null) {
  if (err) {
    msg += `\n${err.message || err.toString()}`

    const fileName = err.fileName || err.filename
    if (fileName && err.lineNumber) {
      msg += `\n${fileName} @ ${err.lineNumber}`
    } else if (err.lineNumber) {
      msg += `\n@ ${err.lineNumber}`
    }

    if (err.stack) msg += `\n${err.stack}`

    Zotero.debug(`EdTechHub: error: ${msg}`, 1)

  } else {
    Zotero.debug(`EdTechHub: ${msg}`)

  }
}

function zotero_itemmenu_popupshowing() {
  const selected = Zotero.getActiveZoteroPane().getSelectedItems()

  const hidden = Zotero.EdTechHub.ready.isPending() || ! selected.find(item => item.isRegularItem())
  for (const elt of Array.from(document.getElementsByClassName('edtechhub-zotero-itemmenu-regularitem'))) {
    (elt as any).hidden = hidden
  }

  document.getElementById('edtechhub-duplicate-attachment').hidden =
    Zotero.EdTechHub.ready.isPending()
    || selected.length !== 1 || !selected[0].isAttachment() // must be a single attachment
    || ! [ Zotero.Attachments.LINK_MODE_LINKED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_URL ].includes(selected[0].attachmentLinkMode) // not a linked or imported file
    || (selected[0].attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL && selected[0].attachmentContentType === 'text/html') // no web snapshots
    || ! selected[0].getFilePath() // path does not exist
}

class AlsoKnownAs {
  private size: number
  private aka: Set<string>
  private init: string

  constructor(init: string = '') {
    // Changing syntax for separator in aka from ";" or "; " to " " (/ +/ to be precise). Only allow / +/ in future release.
    this.aka = new Set(init.split(init.includes(';') ? /; */ : / +/).filter(aka => aka))
    this.init = this.toString()
  }

  add(id: string) {
    id = (id || '').trim()
    if (id) this.aka.add(id)
    return this
  }

  changed() {
    // this.init contains original object; 'this' changes with 'add'.
    // Here we compare the original object (this.init) with the current object (this).
    return this.init.trim() !== this.toString().trim()
  }

  toString() {
    // no idea why this empty element keeps appearing
    return [...this.aka].sort().join(' ')
  }

  first() {
    return [...this.aka].sort()[0]
  }

  *iterator() {
    for (const id of [...this.aka].sort()) {
      yield id
    }
  }
[Symbol.iterator]() {
    return this.iterator()
  }
}

const EdTechHub = Zotero.EdTechHub || new class { // tslint:disable-line:variable-name
  public ready: Promise<boolean>
  private dir: string

  private initialized: boolean = false
  private fieldID: {
    DOI: number,
    extra: number,
  }
  private translators: { file: string, translatorID: string}[] = []

  constructor() {
    const ready = Zotero.Promise.defer()
    this.ready = ready.promise

    window.addEventListener('load', event => {
      this.init(ready)
        .then(() => {
          document.getElementById('zotero-itemmenu').addEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
        })
        .catch(err => {
          debug('init failed', err)
          flash(err.message)
        })
    }, false)

    window.addEventListener('unload', event => {
      document.getElementById('zotero-itemmenu').removeEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
    }, false)
  }

  private getAlsoKnownAs(item) {
    if (!Zotero.ItemFields.isValidForType(this.fieldID.extra, item.itemTypeID)) return new AlsoKnownAs

    for (const line of (item.getField('extra') || '').split('\n')) {
      if (line.startsWith(prefix)) {
        return new AlsoKnownAs(line.substring(prefix.length))
      }
    }

    return (new AlsoKnownAs).add(itemKey(Zotero.URI.getItemURI(item)))
  }

  private setAlsoKnownAs(item, alsoKnownAs: AlsoKnownAs) {
    debug(`setAlsoKnownAs+ ${alsoKnownAs.toString()}`)
    const extra = (item.getField('extra') || '')
      .split('\n')
      .filter(line => ! line.startsWith(prefix))
      .concat(`${prefix} ${alsoKnownAs.toString()}`)
      .join('\n')
    debug(`setAlsoKnownAs: ${extra}`)
    item.setField('extra', extra)
  }

  public run(method, ...args) {
    debug(`requesting ${method}`);
    (async () => {
      await this.ready
      debug(`running ${method}`)
      try {
        this[method].apply(this, args)
        debug(`done ${method}`)
      } catch (err) {
        debug(`err ${method}`)
        debug(method, err)
        flash(err.message)
      }
    })()
  }

  public async assignKey() {
    await this.ready

    const items = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem())

    for (const item of items) {
      debug('assignKey (0a): ' + JSON.stringify({ item: item.id }))
      debug('assignKey (0b): ' + JSON.stringify({ extra: item.getField('extra') }))

      const doi = { long: Zotero.ItemFields.isValidForType(this.fieldID.DOI, item.itemTypeID) ? item.getField('DOI') : '', short: '', assign: '' }

      let m
      for (const line of item.getField('extra').split('\n')) {
        if (m = line.trim().match(/^DOI:\s*(.+)/i)) {
          doi.long = m[1]
        } else if (m = line.trim().match(/^shortDOI:\s*(.+)/i)) {
          doi.short = m[1]
        }
      }

      if (doi.long) doi.long = Zotero.Utilities.cleanDOI(doi.long)
      if (doi.short) doi.short = Zotero.Utilities.cleanDOI(doi.short)

      doi.assign = doi.short || doi.long

      debug('assignKey (0c): ' + JSON.stringify({ extra: item.getField('extra') }))

      const alsoKnownAs = this.getAlsoKnownAs(item)

      debug('assignKey (1): ' + JSON.stringify({ changed: alsoKnownAs.changed(), aka: alsoKnownAs.toString() }))

      alsoKnownAs.add(doi.assign)
      alsoKnownAs.add(`${libraryKey(item)}:${item.key}`)

      debug('assignKey (2): ' + JSON.stringify({ changed: alsoKnownAs.changed(), aka: alsoKnownAs.toString() }))

      /*
      "relations": {
        "owl:sameAs": "http://zotero.org/groups/2405685/items/BMM3Z3CM"
      },
      */

      getRelations(item, alsoKnownAs)

      debug('assignKey (3): ' + JSON.stringify({ changed: alsoKnownAs.changed(), aka: alsoKnownAs.toString() }))

      /*
      if (!key && Zotero.ShortDOI && item.getTags().find(tag => [Zotero.ShortDOI.tag_invalid, Zotero.ShortDOI.tag_multiple, Zotero.ShortDOI.tag_nodoi].includes(tag.tag))) {
      }
      */
      debug('assignKey (4): ' + JSON.stringify({ changed: alsoKnownAs.changed(), aka: alsoKnownAs.toString() }))
      if (alsoKnownAs.changed()) {
        this.setAlsoKnownAs(item, alsoKnownAs)
        await item.saveTx()
      }
    }
  }

  public async saveToNote() {
    const items = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem())

    for (const item of items) {
      const note = new Zotero.Item('note')
      note.libraryID = item.libraryID

      let user = Zotero.Prefs.get('sync.server.username')
      user = user ? `${user}, ` : ''
      note.setNote(`<p><b>Item details (${user}${new Date})</b></p>\n<pre>${Zotero.Utilities.text2html(await asRIS(item))}</pre>`)
      note.parentKey = item.key
      await note.saveTx()
    }
  }

  public async duplicateAttachment() {
    await this.ready

    const attachment = Zotero.getActiveZoteroPane().getSelectedItems().find(item => item.isAttachment())
    const path = await attachment.getFilePathAsync()
    if (!path) return

    const parent = typeof attachment.parentItemID === 'number' ? await Zotero.Items.get(attachment.parentItemID) : null
    debug(`duplicateAttachment: ${path} ${typeof path}`)

    const baseName = OS.Path.basename(path)
    const baseNameWithoutExtension = baseName.replace(/([^.])\.[^.]+$/, '$1') // remove extension, but make sure there's at least one char before it
    const ext = baseName.substring(baseNameWithoutExtension.length)

    const fileBaseName = sanitize_filename([
      baseNameWithoutExtension,
      Zotero.Prefs.get('sync.server.username'),
      (new Date).toISOString().replace(/T.*/, '').replace(/-/g, ''),
      parent ? this.getAlsoKnownAs(parent).first().replace(/[^a-z0-9]+/gi, '_') : null,
    ].filter(bn => bn).join('-'))

    switch (attachment.attachmentLinkMode) {
      case Zotero.Attachments.LINK_MODE_LINKED_FILE:
        const dirName = OS.Path.dirname(path)
        let copy
        let postfix = 0
        while (await OS.File.exists(copy = OS.Path.join(dirName, `${fileBaseName}${postfix ? '-' + postfix : ''}${ext}`))) {
          postfix += 1
        }
        await OS.File.copy(path, copy)
        await Zotero.Attachments.linkFromFile({
          file: copy,
          parentItemID: parent ? attachment.parentItemID : undefined,
          collections: parent ? undefined : attachment.getCollections(),
          contentType: attachment.contentType,
          charset: attachment.charset,
        })
        break

      case Zotero.Attachments.LINK_MODE_IMPORTED_FILE:
      case Zotero.Attachments.LINK_MODE_IMPORTED_URL:
        await Zotero.Attachments.importFromFile({
          file: path,
          libraryID: attachment.libraryID,
          parentItemID: parent ? attachment.parentItemID : undefined,
          collections: parent ? undefined : attachment.getCollections(),
          fileBaseName,
          contentType: attachment.contentType,
          charset: attachment.charset,
        })
        debug(`imported file: ${fileBaseName}`)
        break

      default:
        return
    }
  }

  private async init(ready) {
    if (this.initialized) return
    this.initialized = true

    const progressWin = new Zotero.ProgressWindow({ closeOnClick: false })
    progressWin.changeHeadline('EdTech hub: waiting for Zotero')
    const icon = `chrome://zotero/skin/treesource-unfiled${Zotero.hiDPI ? '@2x' : ''}.png`
    const progress = new progressWin.ItemProgress(icon, 'Waiting for Zotero.Schema.schemaUpdatePromise, please be patient')
    progressWin.show()
    await Zotero.Schema.schemaUpdatePromise
    progress.setText('Ready')
    progressWin.startCloseTimer(500) // tslint:disable-line:no-magic-numbers

    this.dir = OS.Path.join(Zotero.DataDirectory.dir, 'edtechhub')
    await OS.File.makeDir(this.dir, { ignoreExisting: true })

    Zotero.Notifier.registerObserver(this, ['item'], 'EdTechHub', 1)

    this.fieldID = {
      DOI: Zotero.ItemFields.getID('DOI'),
      extra: Zotero.ItemFields.getID('extra'),
    }

    ready.resolve(true)

    const addons = await Zotero.getInstalledExtensions()
    if (!addons.find(addon => addon.startsWith('Zotero DOI Manager '))) flash('Zotero-ShortDOI not installed', 'The short-doi plugin is not available, please install it from https://github.com/bwiernik/zotero-shortdoi')
    if (!addons.find(addon => addon.startsWith('ZotFile '))) flash('ZotFile not installed', 'The ZotFile plugin is not available, please install it from http://zotfile.com/')
    if (!addons.find(addon => addon.startsWith('Zutilo Utility for Zotero '))) flash('Zutilo not installed', 'The Zutilo plugin is not available, please install it from https://github.com/willsALMANJ/Zutilo')

    await this.installTranslators()
  }

  private async copyToClipboard(translatorID) {
    const items = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem())
    const nitems = items.length // translate consumes the items
    if (!nitems) return

    const text = await translate(items, translatorID)
    toClipboard(text)
    flash(`${nitems} items copied to clipboard`)
  }

  private async installTranslator(name) {
    const translator = Zotero.File.getContentsFromURL(`resource://zotero-edtechhub/${name}`)
    const sep = '\n}\n'
    const split = translator.indexOf(sep) + sep.length
    const header = JSON.parse(translator.slice(0, split))
    const code = translator.slice(split)

    await Zotero.Translators.save(header, code)

    this.translators.push({ file: header.label + '.js', translatorID: header.translatorID })

    debug(`installed ${name}`)
  }

  private async installTranslators() {
    debug('installing translators')
    await this.installTranslator('Bjoern2A_BjoernCitationStringTagged.js')
    await this.installTranslator('Bjoern2B_BjoernCitationStringTagged.js')
    await this.installTranslator('Bjoern7_ETHref.js')
    await Zotero.Translators.reinit()
  }

  private uninstallTranslators(name) {
    for (const { file } of this.translators) {
      const translator = Zotero.getTranslatorsDirectory()
      translator.append(file)
      if (translator.exists()) translator.remove(false)
    }
    this.translators = []
  }

  public async debugLog() {
    await this.ready

    const service = 'https://transfer.sh/'

    const log = []

    const items = Zotero.getActiveZoteroPane().getSelectedItems() || []
    if (items.length) {
      log.push(put(`${service}items.rdf`, await translate(items, '14763d24-8ba0-45df-8f52-b8d1108e7ac9'))) // RDF
      const f = OS.Path.join(this.dir, 'items.rdf')


    }

    log.push(put(`${service}debug-log.txt`, Zotero.getErrors(true).concat(
      '',
      '',
      Zotero.Debug.getConsoleViewerOutput()
    ).join('\n').trim()))

    const responses = await Promise.all(log)
    debug(`debug log: ${JSON.stringify(responses)}`)
    alert(responses.map(url => url.trim()).join('\n'))
  }

  protected async notify(action, type, ids, extraData) {
    if (type !== 'item') return // should never happen

    switch (action) {
      case 'delete':
      case 'trash':
        break

      case 'add':
      case 'modify':
        const items = await Zotero.Items.getAsync(ids)
        for (const item of items) {
          await item.loadAllData()
          const itemRelations = item.getRelations()
          debug(`notify:${type}.${action}: ${JSON.stringify(itemRelations)}`)
        }
        break

      default:
        return
    }
  }
}

export = EdTechHub

Components.utils.import('resource://gre/modules/AddonManager.jsm')
declare const AddonManager: any
AddonManager.addAddonListener({
  onUninstalling(addon, needsRestart) {
    if (addon.id !== 'edtechhub@edtechhub.org') return null

    EdTechHub.uninstallTranslators()
    const quickCopy = Zotero.Prefs.get('export.quickCopy.setting')
    for (const { translatorID } of EdTechHub.translators) {
      if (quickCopy === `export=${translatorID}`) Zotero.Prefs.clear('export.quickCopy.setting')
    }

    EdTechHub.uninstalled = true
  },

  onDisabling(addon, needsRestart) { this.onUninstalling(addon, needsRestart) },

  onOperationCancelled(addon, needsRestart) {
    if (addon.id !== 'edtechhub@edtechhub.org') return null
    // tslint:disable-next-line:no-bitwise
    if (addon.pendingOperations & (AddonManager.PENDING_UNINSTALL | AddonManager.PENDING_DISABLE)) return null

    // uninstall cancelled, re-do installation.
    EdTechHub.installTranslators()

    delete EdTechHub.uninstalled
  },
})

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
