declare const Zotero: any
declare const Components: any

const marker = 'EdTechHubMonkeyPatched'

function $patch$(object, method, patcher) {
  if (object[method][marker]) return
  object[method] = patcher(object[method])
  object[method][marker] = true
}

$patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
  try {
    await Zotero.Schema.schemaUpdatePromise

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
