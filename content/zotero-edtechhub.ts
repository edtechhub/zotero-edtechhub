declare const Zotero: any
declare const Components: any

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
    debug(`@flash failed: ${JSON.stringify({title, body})} ${err}`)
  }
}

function notify(events, handler) {
  Zotero.Notifier.registerObserver({
    notify(...args) {
      Zotero.Schema.schemaUpdatePromise
        .then(() => handler.apply(null, args))
        .then(err => debug(`notify: finished ${JSON.stringify(args)}`))
        .catch(err => debug(`notify: error ${JSON.stringify(args)}: ${err}`))
    },
  }, (typeof events === 'string') ? [ events ] : events, 'EdTechHub', 1)
}

function libraryKey(item) {
  return Zotero.URI.getLibraryPath(item.libraryID || Zotero.Libraries.userLibraryID).replace(/.*\//, '')
}

function isShortDOI(ShortDOI) { // tslint:disable-line:variable-name
  return ShortDOI.match(/^10\/[a-z0-9]+$/)
}

$patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
  try {
    await Zotero.Schema.schemaUpdatePromise

    // preserve archiveLocation of all merged items
    try {
      const archiveLocation = this.getArchiveLocation(item).split(';')
      const otherArchiveLocation = Array.from(new Set(otherItems.map(i => this.getArchiveLocation(i)))).filter(al => al && !archiveLocation.includes(al)).sort()
      this.setArchiveLocation(item, archiveLocation.concat(otherArchiveLocation).join(';'))
    } catch (err) {
      debug('Cannot set archiveLocation on item: ' + err)
    }

    // keep RIS copy of all merged items
    const deferred = Zotero.Promise.defer()
    const translation = new Zotero.Translate.Export()
    translation.setItems([item, ...otherItems])
    translation.setTranslator('32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7') // RIS
    translation.setHandler('done', (obj, success) => {
      if (success) {
        deferred.resolve(obj ? obj.string : '')
      } else {
        Zotero.logError('RIS-merge failed')
        deferred.resolve('')
      }
    })
    translation.translate()

    let user = Zotero.Prefs.get('sync.server.username')
    user = user ? `${user}, ` : ''

    let body = `<div><b>Item history (${user}${new Date})</b></div>\n`
    body += `<pre>${Zotero.Utilities.text2html(await deferred.promise)}</pre>\n`
    body += '<div><table>\n'
    body += `<tr><td>group:</td><td>${libraryKey(item)}</td></tr>\n`
    body += `<tr><td>itemKey:</td><td>${item.key}</td></tr>\n`
    body += `<tr><td>itemKeyOld:</td><td>${otherItems.map(i => i.key).join(', ')}</td></tr>\n`
    body += '</table></div>\n'

    const note = new Zotero.Item('note')
    note.libraryID = item.libraryID
    note.setNote(body)
    note.parentKey = item.key
    await note.saveTx()

  } catch (err) {
    debug('merge', err)
  }

  return original.apply(this, arguments)
})

function debug(msg, err = null) {
  if (err) {
    Zotero.debug(`{EdTech hub error}: ${msg} ${err}`)
  } else {
    Zotero.debug(`{EdTech hub}: ${msg}`)
  }
}

const ready = Zotero.Promise.defer()

const EdTechHub = Zotero.EdTechHub || new class { // tslint:disable-line:variable-name
  public ready: Promise<boolean>

  private initialized: boolean = false
  private fieldID: {
    archiveLocation: number
    DOI: number
  }

  constructor() {
    this.ready = ready.promise

    window.addEventListener('load', event => {
      this.init().catch(err => Zotero.logError(err))
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

  public assignKey() {
    this._assignKey().catch(err => debug('assignKey', err))
  }
  private async _assignKey() {
    await this.ready

    const items = Zotero.getActiveZoteroPane().getSelectedItems()

    for (const item of items) {
      debug('assignKey: ' + JSON.stringify({ item: item.id }))

      const doi = { long: Zotero.ItemFields.isValidForType(this.fieldID.DOI, item.itemTypeID) ? item.getField('DOI') : '', short: '' }

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

      if (!doi.short && isShortDOI(doi.long)) doi.short = doi.long

      debug('assignKey: ' + JSON.stringify(doi))

      let key = doi.short || doi.long
      debug(`shortdoi: ${JSON.stringify({ invalid: Zotero.ShortDOI.tag_invalid, multiple: Zotero.ShortDOI.tag_multiple, nodoi: Zotero.ShortDOI.tag_nodoi, tags: item.getTags().map(tag => tag.tag) })}`)
      if (!key && Zotero.ShortDOI && item.getTags().find(tag => [Zotero.ShortDOI.tag_invalid, Zotero.ShortDOI.tag_multiple, Zotero.ShortDOI.tag_nodoi].includes(tag.tag))) {
        key = `${libraryKey(item)}:${item.key}`
      }
      if (key) {
        const archiveLocation = this.getArchiveLocation(item).split(';')
        if (!archiveLocation.includes(key)) {
          archiveLocation.unshift(key)
          this.setArchiveLocation(item, archiveLocation.filter(al => al).join(';'))
          await item.saveTx()
        }
      }
    }
  }

  private async init() {
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

  }
}

export = EdTechHub

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
