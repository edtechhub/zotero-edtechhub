declare const Zotero: any
declare const Components: any

const marker = 'EdTechHubMonkeyPatched'

function $patch$(object, method, patcher) {
  if (object[method][marker]) return
  object[method] = patcher(object[method])
  object[method][marker] = true
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
        .catch(err => Zotero.debug(`EdtTechHub.notify: ${JSON.stringify(args)}`))
    },
  }, (typeof events === 'string') ? [ events ] : events, 'EdTechHub', 1)
}

async function addArchiveLocation(item, id) {
  const archiveLocation = getField(item, 'archiveLocation').split(';')
  if (!archiveLocation.includes(id)) {
    archiveLocation.unshift(id)
    item.setField('archiveLocation', archiveLocation.join(';'))
    await item.saveTx()
  }
}

notify(['item-tag', 'item'], async (action, type, ids, extraData) => {
  Zotero.debug('notify: ' + JSON.stringify({ action, type, ids, extraData }))

  if (type === 'item-tag') ids = ids.map(id => parseInt(id.split('-')[0]))

  for (const item of await Zotero.Items.getAsync(ids)) {
    let doi = getField(item, 'DOI')
    let short_doi = ''
    let m
    for (const line of getField(item, 'extra').split('\n')) {
      if (m = line.trim().match(/^DOI:\s*(.+)/i)) {
        doi = m[1]
      } else if (m = line.trim().match(/^shortDOI:\s*(.+)/i)) {
        short_doi = m[1]
      }
    }

    if (m = short_doi.match(/^https?:\/\/doi\.org\/([a-z]+)$/)) {
      short_doi = m[1]
    }
    if (!short_doi && (m = doi.match(/^(?:https?:\/\/)doi\.org\/([a-z]+)$/))) {
      short_doi = m[1]
    }

    if (short_doi) {
      await addArchiveLocation(item, short_doi)
    } else if (item.getTags().find(tag => tag.tag === 'no doi found')) {
      await addArchiveLocation(item, `${item.uri.replace(/.*\//, '')}:${item.key}`)
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

    const libraryKey = Zotero.URI.getLibraryPath(item.libraryID || Zotero.Libraries.userLibraryID).replace(/.*\//, '')

    let body = `<div><b>Item history (${user}${new Date})</b></div>\n`
    body += `<pre>${Zotero.Utilities.text2html(await deferred.promise)}</pre>\n`
    body += '<div><table>\n'
    body += `<tr><td>group:</td><td>${libraryKey}</td></tr>\n`
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
  }
}

export = EdTechHub

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
