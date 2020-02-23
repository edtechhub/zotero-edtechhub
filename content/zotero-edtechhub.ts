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

function notify(events, handler) {
  Zotero.Notifier.registerObserver({
    notify(...args) {
      Zotero.Schema.schemaUpdatePromise
        .then(() => handler.apply(null, args))
        .then(err => debug(`notify: finished ${JSON.stringify(args)}`))
        .catch(err => debug(`notify: error ${JSON.stringify(args)}`, err))
    },
  }, (typeof events === 'string') ? [ events ] : events, 'EdTechHub', 1)
}

function libraryKey(item) {
  return Zotero.URI.getLibraryPath(item.libraryID || Zotero.Libraries.userLibraryID).replace(/.*\//, '')
}

function isShortDOI(ShortDOI) { // tslint:disable-line:variable-name
  return ShortDOI.match(/^10\/[a-z0-9]+$/)
}

function translate(items, translator) { // returns a promise
  const deferred = Zotero.Promise.defer()
  const translation = new Zotero.Translate.Export()
  translation.setItems(items)
  translation.setTranslator(translator)
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

$patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
  debug('merge:')
  try {
    await Zotero.Schema.schemaUpdatePromise

    // preserve archiveLocation of all merged items
    const archiveLocation = Zotero.EdTechHub.getArchiveLocation(item).split(';')
    debug(`merge-archiveLocation: pre archiveLocation = ${JSON.stringify(archiveLocation)}`)
    for (const otherItem of otherItems) {
      for (const al of Zotero.EdTechHub.getArchiveLocation(otherItem).split(';')) {
        debug(`merge-archiveLocation: + ${JSON.stringify(al)}`)
        if (al && !archiveLocation.includes(al)) archiveLocation.push(al)
      }
    }
    debug(`merge-archiveLocation: post archiveLocation = ${JSON.stringify(archiveLocation)}`)
    Zotero.EdTechHub.setArchiveLocation(item, archiveLocation.filter(al => al).join(';'))

    // keep RIS copy of all merged items
    const ris = await asRIS([item, ...otherItems])

    let user = Zotero.Prefs.get('sync.server.username')
    user = user ? `${user}, ` : ''

    let body = `<div><b>Item history (${user}${new Date})</b></div>\n`
    body += `<pre>${Zotero.Utilities.text2html(ris)}</pre>\n`
    body += '<div>\n'
    body += `<p>group:</td><td>${libraryKey(item)}</p>\n`
    body += `<p>itemKey:</td><td>${item.key}</p>\n`
    body += `<p>itemKeyOld:</td><td>${otherItems.map(i => i.key).join(', ')}</p>\n`
    body += '</div>\n'

    const note = new Zotero.Item('note')
    note.libraryID = item.libraryID
    note.setNote(body)
    note.parentKey = item.key
    await note.saveTx()

  } catch (err) {
    debug('merge:', err)
  }

  return original.apply(this, arguments)
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

function post(url, body) {
  return new Promise(function(resolve, reject) { // tslint:disable-line:only-arrow-functions
    const xhr = Components.classes['@mozilla.org/xmlextras/xmlhttprequest;1'].createInstance()

    xhr.open('POST', url)

    xhr.onload = function() {
      if (this.status >= 200 && this.status < 300) { // tslint:disable-line:no-magic-numbers
        resolve(xhr.response)
      } else {
        reject({ status: this.status, statusText: xhr.statusText })
      }
    }

    xhr.onerror = function() {
      reject({ status: this.status, statusText: xhr.statusText })
    }

    xhr.send(body)
  })
}

function zotero_itemmenu_popupshowing() {
  const selected = Zotero.getActiveZoteroPane().getSelectedItems()

  document.getElementById('edtechhub-assign-key').hidden = Zotero.EdTechHub.ready.isPending() || ! selected.find(item => item.isRegularItem())
  document.getElementById('edtechhub-save-to-note').hidden = Zotero.EdTechHub.ready.isPending() || ! selected.find(item => item.isRegularItem())

  document.getElementById('edtechhub-duplicate-attachment').hidden =
    Zotero.EdTechHub.ready.isPending()
    || selected.length !== 1 || !selected[0].isAttachment() // must be a single attachment
    || ! [ Zotero.Attachments.LINK_MODE_LINKED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_URL ].includes(selected[0].attachmentLinkMode) // not a linked or imported file
    || (selected[0].attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL && selected[0].attachmentContentType === 'text/html') // no web snapshots
    || ! selected[0].getFilePath() // path does not exist
}

const EdTechHub = Zotero.EdTechHub || new class { // tslint:disable-line:variable-name
  public ready: Promise<boolean>

  private initialized: boolean = false
  private fieldID: {
    archiveLocation: number
    DOI: number
  }
  private translators: { file: string, translatorID: string}[] = []

  constructor() {
    const ready = Zotero.Promise.defer()
    this.ready = ready.promise

    window.addEventListener('load', event => {
      this.run('init', ready)
      document.getElementById('zotero-itemmenu').addEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
    }, false)

    window.addEventListener('unload', event => {
      document.getElementById('zotero-itemmenu').removeEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
    }, false)
  }

  private getArchiveLocation(item) {
    if (Zotero.ItemFields.isValidForType(this.fieldID.archiveLocation, item.itemTypeID)) return item.getField('archiveLocation') || ''

    let m
    for (const line of (item.getField('extra') || '').split('\n')) {
      if (m = line.match(/^archiveLocation:(.*)/i)) {
        return m[1].trim()
      }
    }

    return ''
  }

  private setArchiveLocation(item, archiveLocation) {
    const extra = (item.getField('extra') || '').split('\n').filter(line => ! line.match(/^archiveLocation:/i)).join('\n').trim()

    if (Zotero.ItemFields.isValidForType(this.fieldID.archiveLocation, item.itemTypeID)) {
      item.setField('archiveLocation', archiveLocation)
      item.setField('extra', extra)
    } else {
      item.setField('extra', (extra + `\narchiveLocation: ${archiveLocation}`).trim())
    }
  }

  public run(method, ...args) {
    this[method].apply(this, args).catch(err => {
      debug(method, err)
      flash(err.message)
    })
  }

  public async assignKey() {
    await this.ready

    const items = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem())

    for (const item of items) {
      debug('assignKey: ' + JSON.stringify({ item: item.id }))

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

      const archiveLocation = this.getArchiveLocation(item).split(';')
      let save = false

      if (doi.assign && !archiveLocation.includes(doi.assign)) {
        archiveLocation.push(doi.assign)
        save = true
      }

      const key = `${libraryKey(item)}:${item.key}`
      if (!archiveLocation.includes(key)) {
        archiveLocation.push(key)
        save = true
      }

      debug('assignKey: ' + JSON.stringify({...doi, key, save }))

      /*
      if (!key && Zotero.ShortDOI && item.getTags().find(tag => [Zotero.ShortDOI.tag_invalid, Zotero.ShortDOI.tag_multiple, Zotero.ShortDOI.tag_nodoi].includes(tag.tag))) {
      }
      */
      if (save) {
        this.setArchiveLocation(item, archiveLocation.filter(al => al).join(';'))
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
      parent ? this.getArchiveLocation(parent).split(';')[0].replace(/[^a-z0-9]+/gi, '_') : null,
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

    this.fieldID = {
      archiveLocation: Zotero.ItemFields.getID('archiveLocation'),
      DOI: Zotero.ItemFields.getID('DOI'),
    }

    ready.resolve(true)

    const addons = await Zotero.getInstalledExtensions()
    if (!addons.find(addon => addon.startsWith('Zotero DOI Manager '))) flash('Zotero-ShortDOI not installed', 'The short-doi plugin is not available, please install it from https://github.com/bwiernik/zotero-shortdoi')
    if (!addons.find(addon => addon.startsWith('ZotFile '))) flash('ZotFile not installed', 'The ZotFile plugin is not available, please install it from http://zotfile.com/')
    if (!addons.find(addon => addon.startsWith('Zutilo Utility for Zotero '))) flash('Zutilo not installed', 'The Zutilo plugin is not available, please install it from https://github.com/willsALMANJ/Zutilo')

    await this.installTranslators()
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

    let body

    const log = []

    // const service = 'https://httpbin.org/post'
    const service = 'https://0x0.st'

    const items = Zotero.getActiveZoteroPane().getSelectedItems() || []
    if (items.length) {
      body = new FormData()
      const rdf = await translate(items, '14763d24-8ba0-45df-8f52-b8d1108e7ac9') // RDF
      body.set('file', new Blob([ rdf ], { type: 'application/rdf' }), 'items.rdf')
      log.push(post(service, body))
    }

    body = new FormData()
    body.set('file', new Blob([ (Zotero.getErrors(true).join('\n') + '\n\n' + Zotero.Debug.getConsoleViewerOutput()).trim() ], { type: 'text/plain' }), 'log.txt') // tslint:disable-line:prefer-template
    log.push(post(service, body))

    const responses = await Promise.all(log)
    alert(responses.map(url => url.trim().replace(/.*\//, '')).join('+'))
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
