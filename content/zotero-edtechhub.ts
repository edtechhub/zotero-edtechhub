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
    Zotero.debug(`@flash failed: ${JSON.stringify({title, body})} ${err}`)
  }
}

function getField(item, field) {
  try {
    return item.getField(field) || ''
  } catch (err) {
    return ''
  }
}

function notify(events, handler) {
  Zotero.Notifier.registerObserver({
    notify(...args) {
      Zotero.Schema.schemaUpdatePromise
        .then(() => handler.apply(null, args))
        .then(err => Zotero.debug(`EdtTechHub.notify: finished ${JSON.stringify(args)}`))
        .catch(err => Zotero.debug(`EdtTechHub.notify: error ${JSON.stringify(args)}: ${err}`))
    },
  }, (typeof events === 'string') ? [ events ] : events, 'EdTechHub', 1)
}

function libraryKey(item) {
  return Zotero.URI.getLibraryPath(item.libraryID || Zotero.Libraries.userLibraryID).replace(/.*\//, '')
}

function isShortDOI(ShortDOI) { // tslint:disable-line:variable-name
  return ShortDOI.match(/^10\/[a-z0-9]+$/)
}

async function addArchiveLocation(item, id) {
  const archiveLocation = getField(item, 'archiveLocation').split(';')
  if (!archiveLocation.includes(id)) {
    archiveLocation.unshift(id)
    item.setField('archiveLocation', archiveLocation.filter(al => al).join(';'))
    await item.saveTx()
  }
}

notify(['item-tag', 'item'], async (action, type, ids, extraData) => {
  Zotero.debug('notify: ' + JSON.stringify({ action, type, ids, extraData }))

  if (type === 'item-tag') ids = ids.map(id => parseInt(id.split('-')[0]))

  Zotero.debug('notify: ' + JSON.stringify({ ids }))

  const items = await Zotero.Items.getAsync(ids)

  Zotero.debug('notify: ' + JSON.stringify({ ids, items: items.length }))
  for (const item of items) {
    Zotero.debug('notify: ' + JSON.stringify({ item: item.id }))

    const doi = { long: getField(item, 'DOI'), short: '' }

    let m
    for (const line of getField(item, 'extra').split('\n')) {
      if (m = line.trim().match(/^DOI:\s*(.+)/i)) {
        doi.long = m[1]
      } else if (m = line.trim().match(/^shortDOI:\s*(.+)/i)) {
        doi.short = m[1]
      }
    }

    if (doi.long) doi.long = Zotero.Utilities.cleanDOI(doi.long)
    if (doi.short) doi.short = Zotero.Utilities.cleanDOI(doi.short)

    if (!doi.short && isShortDOI(doi.long)) doi.short = doi.long

    if (!doi.short && Zotero.ShortDOI) {
      const url = Zotero.ShortDOI.generateItemUrl(item, 'short')
      if (url && url !== 'invalid') {
        try {
          const res = JSON.parse((await Zotero.HTTP.request('GET', url, { responseType: 'application/json' })).responseText)
          Zotero.debug('notify: ' + JSON.stringify(res))
          if (res.ShortDOI) doi.short = res.ShortDOI
        } catch (err) {
          Zotero.debug('notify: err = ' + err)
        }
      }
    }

    Zotero.debug('notify: ' + JSON.stringify({ doi }))
    if (doi.short) {
      await addArchiveLocation(item, doi.short)
    } else if (Zotero.ShortDOI && item.getTags().find(tag => [Zotero.ShortDOI.tag_invalid, Zotero.ShortDOI.tag_multiple, Zotero.ShortDOI.tag_nodoi].includes(tag.tag))) {
      await addArchiveLocation(item, `${libraryKey(item)}:${item.key}`)
    }
  }
})

$patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
  try {
    await Zotero.Schema.schemaUpdatePromise

    // preserve archiveLocation of all merged items
    try {
      const archiveLocation = getField(item, 'archiveLocation').split(';')
      const otherArchiveLocation = Array.from(new Set(otherItems.map(i => getField(i, 'archiveLocation')))).filter(al => al && !archiveLocation.includes(al)).sort()
      item.setField('archiveLocation', archiveLocation.concat(otherArchiveLocation).join(';'))
    } catch (err) {
      Zotero.debug('Cannot set archiveLocation on item: ' + err)
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
    Zotero.debug(`EdTecHub: ${err}`)
  }

  return original.apply(this, arguments)
})

const EdTechHub = Zotero.EdTechHub || new class { // tslint:disable-line:variable-name
  private initialized: boolean = false

  constructor() {
    window.addEventListener('load', event => {
      this.init().catch(err => Zotero.logError(err))
    }, false)
  }

  private async init() {
    if (this.initialized) return
    this.initialized = true

    // if (!Zotero.ShortDOI) flash('Zotero-ShortDOI not installed', 'The short-doi plugin is not available, please install it from https://github.com/bwiernik/zotero-shortdoi')

    const addons = await Zotero.getInstalledExtensions()
    Zotero.debug(`init.addons: ${JSON.stringify(addons)}`)
  }
}

export = EdTechHub

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
