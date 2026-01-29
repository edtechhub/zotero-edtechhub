declare const Zotero: any
declare const Components: any
declare const ChromeUtils: any
declare const Services: any
declare let OS: any

import { OS as $OS } from './osfile'
if (typeof OS === 'undefined') OS = $OS

const l10n = require('./locale/en-US/zotero-edtechhub.ftl')

Services.wm.addListener({
  onOpenWindow: xulWindow => {
    const win: Window = xulWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindow)
    switch (win.location.href) {
      case 'chrome://zotero/content/standalone/standalone.xul':
      case 'chrome://zotero/content/zoteroPane.xhtml':
        Zotero.EdTechHub?.ui(win)
    }
  },
  // onCloseWindow: () => { },
  // onWindowTitleChange: _xulWindow => { },
})

var EdTechHub: EdTechHubMain // eslint-disable-line no-var

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DebugLog: DebugLogSender } = require('zotero-plugin/debug-log')
import { patch as $patch$, unpatch as $unpatch$ } from './monkey-patch'

import sanitize_filename = require('sanitize-filename')

function flash(title, body = null, timeout = 8) { // eslint-disable-line @typescript-eslint/no-magic-numbers
  try {
    const pw = new Zotero.ProgressWindow()
    pw.changeHeadline(`EdTech Hub: ${title}`)
    if (!body) body = title
    if (Array.isArray(body)) body = body.join('\n')
    pw.addDescription(body)
    pw.show()
    pw.startCloseTimer(timeout * 1000) // eslint-disable-line @typescript-eslint/no-magic-numbers
  }
  catch (err) {
    debug(`@flash failed: ${JSON.stringify({ title, body })}`, err)
  }
}

const prefixLegacy = 'EdTechHub.ItemAlsoKnownAs:'
const prefix = 'KerkoCite.ItemAlsoKnownAs:'

function libraryKey(item: any): string {
  const key: string = Zotero.URI.getLibraryPath(item.libraryID || (Zotero.Libraries.userLibraryID as number))
  return key.replace(/.*\//, '')
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

function toClipboardHTML(content) {

  const clipboard = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard)
  const transferable = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable)

  const str = Components.classes['@mozilla.org/supports-string;1'].createInstance(Components.interfaces.nsISupportsString)
  str.data = content
  transferable.addDataFlavor('text/html')
  transferable.setTransferData('text/html', str, content.length * 2) // don't recall why the * 2 is there but it doesn't work without it.
  // you can add RTF as mimetype text/richtext in a similar way, and yes, this is the wrong mimetype for RTF, but this is the only thing Firefox accepts

  clipboard.setData(transferable, null, Components.interfaces.nsIClipboard.kGlobalClipboard)

}

function translate(items: any[], translator: string): Promise<string> { // returns a promise
  const deferred = Zotero.Promise.defer()
  const translation = new Zotero.Translate.Export()
  translation.setItems(items)
  translation.setTranslator(translator)
  translation.setDisplayOptions({ exportNotes: false })
  translation.setHandler('done', (obj, success) => {
    if (success) {
      deferred.resolve(obj ? obj.string : '')
    }
    else {
      debug(`translate with ${translator} failed`, { message: 'undefined' })
      deferred.resolve('')
    }
  })
  translation.translate()
  return deferred.promise as Promise<string>
}

async function asRIS(items: any[]): Promise<string> {
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
    if (typeof relations === 'string') relations = [relations]
    if (!Array.isArray(relations)) continue

    for (const uri of relations) {
      alsoKnownAs.add(itemKey(uri))
    }
  }
}

function debug(msg, err = null) {
  if (err) {
    msg += `\n${err.message || err.toString()}`

    const fileName = err.fileName || err.filename
    if (fileName && err.lineNumber) {
      msg += `\n${fileName} @ ${err.lineNumber}`
    }
    else if (err.lineNumber) {
      msg += `\n@ ${err.lineNumber}`
    }

    if (err.stack) msg += `\n${err.stack}`

    Zotero.debug(`EdTechHub: error: ${msg}`, 1)

  }
  else {
    Zotero.debug(`EdTechHub: ${msg}`)
  }
}

function zotero_itemmenu_popupshowing() {
  if (!Zotero.EdTechHub) return

  const selected = Zotero.getActiveZoteroPane().getSelectedItems()

  const doc = Zotero.getMainWindow().document
  // Check if startup is still in progress by checking if ready promise is pending
  // Since standard Promises don't have isPending(), we track this with a flag
  const hidden = !selected.find(item => item.isRegularItem()) // eslint-disable-line @typescript-eslint/no-unsafe-return
  for (const elt of Array.from(doc.getElementsByClassName('edtechhub-zotero-itemmenu-regularitem') as HTMLElement[])) {
    elt.hidden = hidden
  }

  doc.getElementById('edtechhub-duplicate-attachment').hidden =
    selected.length !== 1 || !selected[0].isAttachment() // must be a single attachment
    || ![Zotero.Attachments.LINK_MODE_LINKED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_FILE, Zotero.Attachments.LINK_MODE_IMPORTED_URL].includes(selected[0].attachmentLinkMode) // not a linked or imported file
    || (selected[0].attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL && selected[0].attachmentContentType === 'text/html') // no web snapshots
    || !selected[0].getFilePath() // path does not exist
}

class AlsoKnownAs {
  private size: number
  private aka: Set<string>
  private init: string

  constructor(init = '', prefixString = '') {
    try {
      init = init.trim()
      this.init = init

      if (prefixString === prefixLegacy) {
        this.aka = new Set(init.split(/; */).filter(aka => aka))
      }
      else {
        this.aka = new Set(init.split(/ +/).filter(aka => aka))
      }
    }
    catch (error) {
      debug(`AlsoKnownAs.constructor error:${  JSON.stringify({ error2: error, aka: this.aka })}`)
    }
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

class EdTechHubMain {
  public ready: Promise<boolean>
  private dir: string

  private fieldID: {
    DOI: number
    extra: number
  }

  public translators: { file: string, translatorID: string }[] = []
  public uninstalled = false

  ui(win : Window) {
    debug('building UI')
    const doc = win.document

    const NAMESPACE = {
      XUL: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
      HTML: 'http://www.w3.org/1999/xhtml',
    }
    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    function create(name: string, attrs: Record<string, number | string | Function | HTMLElement[]> = {}): HTMLElement {
      const children: HTMLElement[] = (attrs.$ as unknown as HTMLElement[]) || []
      delete attrs.$

      const namespace = name.startsWith('html:') ? NAMESPACE.HTML : NAMESPACE.XUL
      name = name.replace('html:', '')

      const elt: HTMLElement = Zotero.platformMajorVersion >= 102 // eslint-disable-line @typescript-eslint/no-magic-numbers
        ? doc[ namespace === NAMESPACE.XUL ? 'createXULElement' : 'createElement' ](name) as HTMLElement
        : doc.createElementNS(namespace, name) as HTMLElement
      attrs.class = `edtechhub ${attrs.class || ''}`.trim()
      for (const [a, v] of Object.entries(attrs)) {
        if (typeof v === 'string') {
          elt.setAttribute(a, v)
        }
        else if (typeof v === 'number') {
          elt.setAttribute(a, `${v}`)
        }
        else if (a.startsWith('on') && typeof v === 'function') {
          elt.addEventListener(a.replace('on', ''), event => { (v(event) as Promise<void>)?.catch?.(err => { throw(err) }) })
        }
        else {
          throw new Error(`unexpected attribute ${a} of type ${typeof v}`)
        }
      }
      for (const child of children) {
        elt.appendChild(child)
      }

      return elt
    }

    doc.getElementById('zotero-itemmenu').addEventListener('popupshowing', zotero_itemmenu_popupshowing, false)

    const itemmenu = doc.getElementById('zotero-itemmenu')
    itemmenu.appendChild(create('menuseparator'))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n.edtechhub_Bjoern2A_BjoernCitationStringTagged,
      oncommand: () => void Zotero.EdTechHub.run('copyToClipboard', '4ec4a50b-e979-448f-af4c-e5b46d1a3b03'),
    }))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n.edtechhub_Bjoern2B_BjoernCitationStringTagged,
      oncommand: () => void Zotero.EdTechHub.run('copyToClipboard', 'b46d575e-396c-11ea-8ee0-0741699b71ec'),
    }))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n.edtechhub_Bjoern2C_BjoernCitationStringTagged,
      oncommand: () => void Zotero.EdTechHub.run('copyToClipboard', 'fe1c68d8-aa8e-11eb-85c1-1799e2c1b06e'),
    }))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n.edtechhub_Bjoern7_ETHref,
      oncommand: () => void Zotero.EdTechHub.run('copyToClipboard', 'ba5f8764-3966-11ea-9cd5-5b52329a4e4c'),
    }))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n['edtechhub_assign-key'],
      oncommand: () => void Zotero.EdTechHub.run('assignKey'),
    }))
    itemmenu.appendChild(create('menuitem', {
      class: 'edtechhub-zotero-itemmenu-regularitem',
      label: l10n['edtechhub_save-to-note'],
      oncommand: () => void Zotero.EdTechHub.run('saveToNote'),
    }))
    itemmenu.appendChild(create('menuitem', {
      id: 'edtechhub-duplicate-attachment',
      label: l10n['edtechhub_duplicate-attachment'],
      oncommand: () => void Zotero.EdTechHub.run('duplicateAttachment'),
    }))

    win.addEventListener('unload', _event => {
      doc.getElementById('zotero-itemmenu').removeEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
      for (const elt of Array.from(doc.getElementsByClassName('edtechhub') as HTMLCollectionOf<HTMLElement>)) {
        elt.remove()
      }
    }, false)
  }

  async startup() {
    let resolveReady: (value: boolean) => void
    this.ready = new Promise(resolve => { resolveReady = resolve })

    const progressWin = new Zotero.ProgressWindow({ closeOnClick: false })
    progressWin.changeHeadline('EdTech hub: waiting for Zotero')
    const icon = `chrome://zotero/skin/treesource-unfiled${Zotero.hiDPI ? '@2x' : ''}.png`
    const progress = new progressWin.ItemProgress(icon, 'Waiting for Zotero.Schema.schemaUpdatePromise, please be patient')
    progressWin.show()
    await Zotero.Schema.schemaUpdatePromise
    progress.setText('Ready')
    progressWin.startCloseTimer(500) // eslint-disable-line @typescript-eslint/no-magic-numbers

    DebugLogSender.register('EdTechHub', [])

    this.dir = OS.Path.join(Zotero.DataDirectory.dir, 'edtechhub')
    await OS.File.makeDir(this.dir, { ignoreExisting: true })

    Zotero.Notifier.registerObserver(this, ['item'], 'EdTechHub', 1)

    this.fieldID = {
      DOI: Zotero.ItemFields.getID('DOI'),
      extra: Zotero.ItemFields.getID('extra'),
    }

    $patch$(Zotero.Items, '_mergePDFAttachments', _original => async function(item, otherItems) {
      Zotero.DB.requireTransaction()
      for (const otherItem of otherItems) {
        for (const otherAttachment of await this.getAsync(otherItem.getAttachments(true))) {
          if (otherAttachment.isPDFAttachment()) {
            otherAttachment.parentItemID = item.id
            await otherAttachment.save()
          }
        }
      }
      return new Map
    })

    $patch$(Zotero.Items, 'merge', original => async function(item, otherItems) {
      let alsoKnownAs: AlsoKnownAs = null
      let history: string = null

      try {
        alsoKnownAs = EdTechHub.getAlsoKnownAs(item)
        // preserve AlsoKnownAs of all merged items
        getRelations(item, alsoKnownAs)
        for (const otherItem of otherItems) {
          for (const id of EdTechHub.getAlsoKnownAs(otherItem)) {
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
        history += `<p>group: ${libraryKey(item)}</p>\n`
        history += `<p>itemKey: ${item.key}</p>\n`
        history += `<p>itemKeyOld: ${otherItems.map((i: { key: string }) => i.key).join(', ')}</p>\n`
        history += '</div>\n'
        // Add 'extra' to history - https://github.com/edtechhub/zotero-edtechhub/issues/60
        history += '<div>\n'
        const itemExtra = item.getField('extra')
        const itemExtraOld = otherItems.map(i => i.getField('extra') as string).join('<br>itemOLD.extra:')
        history += `<p>item.extra: ${itemExtra}</p>\n`
        history += `<p>itemOLD.extra: ${itemExtraOld}</p>\n`
        history += '</div>\n'
      }
      catch (err) {
        debug('merge-alsoKnownAs: error=', err)
      }

      debug('merge-alsoKnownAs: merging...')
      const merged = await original.apply(this, arguments) // eslint-disable-line prefer-rest-params

      try {
        if (alsoKnownAs?.changed()) {
          EdTechHub.setAlsoKnownAs(item, alsoKnownAs)
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
      }
      catch (err) {
        debug('merge-alsoKnownAs: error=', err)
      }

      return merged // eslint-disable-line @typescript-eslint/no-unsafe-return
    })

    /*
    const checks = {
      'Zotero DOI Manager ': [ 'Zotero-ShortDOI not installed', 'The short-doi plugin is not available, please install it from https://github.com/bwiernik/zotero-shortdoi' ],
      'ZotFile ': [ 'ZotFile not installed', 'The ZotFile plugin is not available, please install it from http://zotfile.com/' ],
      'Zutilo Utility for Zotero ': [ 'Zutilo not installed', 'The Zutilo plugin is not available, please install it from https://github.com/willsALMANJ/Zutilo' ],
    }
    const addons = await Zotero.getInstalledExtensions()
    for (const [ name, [ title, body ] ] of Object.entries(checks)) {
      if (!addons.find((addon: string) => addon.startsWith(name))) flash(title, body)
    }
    */

    try {
      debug('installing translators')
      await this.installTranslators()
    }
    catch (err) {
      debug(`translator installation failed: ${err}`)
    }

    resolveReady(true)

    this.ui(Zotero.getMainWindow() as Window)
  }

  shutdown() {
    const win = Zotero.getMainWindow()
    const doc = win.document

    $unpatch$()
    doc.getElementById('zotero-itemmenu').removeEventListener('popupshowing', zotero_itemmenu_popupshowing, false)
    for (const elt of Array.from(doc.getElementsByClassName('edtechhub') as HTMLElement[])) {
      elt.remove()
    }
  }

  public getAlsoKnownAs(item) {
    if (!Zotero.ItemFields.isValidForType(this.fieldID.extra, item.itemTypeID)) return new AlsoKnownAs

    for (const line of (item.getField('extra') as string || '').split('\n')) {
      if (line.startsWith(prefixLegacy)) {
        return new AlsoKnownAs(line.substring(prefixLegacy.length), prefixLegacy)
      }
      if (line.startsWith(prefix)) {
        return new AlsoKnownAs(line.substring(prefix.length), prefix)
      }
    }

    return (new AlsoKnownAs).add(itemKey(Zotero.URI.getItemURI(item)))
  }

  public setAlsoKnownAs(item, alsoKnownAs: AlsoKnownAs) {
    debug(`setAlsoKnownAs+ ${alsoKnownAs.toString()}`)
    // Need to remove line with prefixLegacy
    const extra = (item.getField('extra') || '')
      .split('\n')
      .filter(line => !line.startsWith(prefixLegacy))
      .filter(line => !line.startsWith(prefix))
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
      await this[method].apply(this, args) // eslint-disable-line prefer-spread
      debug(`done ${method}`)
    })().catch (err => {
      debug(`err ${method}`)
      debug(method, err)
      flash(err.message)
    })
  }

  public async assignKey() {
    await this.ready

    const items: any[] = Zotero.getActiveZoteroPane().getSelectedItems().filter((item: any) => item.isRegularItem() as boolean)

    for (const item of items) {
      debug(`assignKey: ${  JSON.stringify({ item: item.id })}`)

      const doi = { long: Zotero.ItemFields.isValidForType(this.fieldID.DOI, item.itemTypeID) ? item.getField('DOI') : '', short: '', assign: '' }

      let m
      for (const line of item.getField('extra').split('\n')) {
        if (m = line.trim().match(/^DOI:\s*(.+)/i)) {
          doi.long = m[1]
        }
        else if (m = line.trim().match(/^shortDOI:\s*(.+)/i)) {
          doi.short = m[1]
        }
      }

      if (doi.long) doi.long = Zotero.Utilities.cleanDOI(doi.long)
      if (doi.short) doi.short = Zotero.Utilities.cleanDOI(doi.short)

      doi.assign = doi.short || doi.long

      const alsoKnownAs = this.getAlsoKnownAs(item)
      alsoKnownAs.add(doi.assign)
      alsoKnownAs.add(`${libraryKey(item)}:${item.key}`)

      getRelations(item, alsoKnownAs)

      /*
      if (!key && Zotero.ShortDOI && item.getTags().find(tag => [Zotero.ShortDOI.tag_invalid, Zotero.ShortDOI.tag_multiple, Zotero.ShortDOI.tag_nodoi].includes(tag.tag))) {
      }
      */
      debug(`assignKey: ${  JSON.stringify({ changed: alsoKnownAs.changed(), aka: alsoKnownAs.toString() })}`)
      if (alsoKnownAs.changed()) {
        this.setAlsoKnownAs(item, alsoKnownAs)
        await item.saveTx()
      }
    }
  }

  public async saveToNote() {
    const items = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem() as boolean)

    for (const item of items) {
      const note = new Zotero.Item('note')
      note.libraryID = item.libraryID

      let user = Zotero.Prefs.get('sync.server.username')
      user = user ? `${user}, ` : ''
      note.setNote(`<p><b>Item details (${user}${new Date})</b></p>\n<pre>${Zotero.Utilities.text2html(await asRIS([item]))}</pre>`)
      note.parentKey = item.key
      await note.saveTx()
    }
  }

  public async duplicateAttachment() {
    await this.ready

    const attachment = Zotero.getActiveZoteroPane().getSelectedItems().find(item => item.isAttachment() as boolean)
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

    const dirName = OS.Path.dirname(path)
    let copy
    let postfix = 0
    switch (attachment.attachmentLinkMode) {
      case Zotero.Attachments.LINK_MODE_LINKED_FILE:
        while (await OS.File.exists(copy = OS.Path.join(dirName, `${fileBaseName}${postfix ? `-${  postfix}` : ''}${ext}`))) {
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

  private async copyToClipboard(translatorID: string) {
    const items: any[] = Zotero.getActiveZoteroPane().getSelectedItems().filter(item => item.isRegularItem() as boolean)
    const nitems = items.length // translate consumes the items
    if (!nitems) return

    const text = await translate(items, translatorID)
    if (text.match(/<a href=/)) {
      toClipboardHTML(text)
      flash(`${nitems} item(s) copied to clipboard as html`)
    }
    else {
      toClipboard(text)
      flash(`${nitems} item(s) copied to clipboard as text`)
    }
  }

  private async installTranslator(name) {
    const translator: string = Zotero.File.getContentsFromURL(`chrome://zotero-edtechhub/content/resource/${name}`)
    const sep = '\n}\n'
    const split = translator.indexOf(sep) + sep.length
    const header = JSON.parse(translator.slice(0, split))
    const code = translator.slice(split)

    await Zotero.Translators.save(header, code)

    this.translators.push({ file: `${header.label}.js`, translatorID: header.translatorID })

    debug(`installed ${name}`)
  }

  public async installTranslators() {
    debug('installing translators')
    await Zotero.Translators.init()
    await this.installTranslator('Bjoern2A_BjoernCitationStringTagged.js')
    await this.installTranslator('Bjoern2B_BjoernCitationStringTagged.js')
    await this.installTranslator('Bjoern2C_BjoernCitationStringTagged.js')
    await this.installTranslator('Bjoern7_ETHref.js')
    await Zotero.Translators.reinit()
  }

  public uninstallTranslators() {
    for (const { file } of this.translators) {
      const translator = Zotero.getTranslatorsDirectory()
      translator.append(file)
      if (translator.exists()) translator.remove(false)
    }
    this.translators = []
  }

  protected async notify(action, type, ids, _extraData) {
    if (type !== 'item') return // should never happen

    let items: any[]
    switch (action) {
      case 'delete':
      case 'trash':
        break

      case 'add':
      case 'modify':
        items = await Zotero.Items.getAsync(ids)
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
EdTechHub = Zotero.EdTechHub = Zotero.EdTechHub || new EdTechHubMain

// Use ChromeUtils.importESModule for Zotero 8 (Firefox 140+)
const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs')
AddonManager.addAddonListener({
  onUninstalling(addon, _needsRestart) { // eslint-disable-line prefer-arrow/prefer-arrow-functions
    if (addon.id !== 'edtechhub@edtechhub.org') return null

    EdTechHub.uninstallTranslators()
    const quickCopy = Zotero.Prefs.get('export.quickCopy.setting')
    for (const { translatorID } of EdTechHub.translators) {
      if (quickCopy === `export=${translatorID}`) Zotero.Prefs.clear('export.quickCopy.setting')
    }

    EdTechHub.uninstalled = true
  },

  onDisabling(addon, needsRestart) { this.onUninstalling(addon, needsRestart) }, // eslint-disable-line prefer-arrow/prefer-arrow-functions

  onOperationCancelled(addon, _needsRestart) { // eslint-disable-line prefer-arrow/prefer-arrow-functions
    if (addon.id !== 'edtechhub@edtechhub.org') return null
    if (addon.pendingOperations & (AddonManager.PENDING_UNINSTALL | AddonManager.PENDING_DISABLE)) return null // eslint-disable-line no-bitwise

    // uninstall cancelled, re-do installation.
    EdTechHub.installTranslators().catch(err => {
      debug('uninstallcancel failed', err)
      flash(err.message)
    })

    EdTechHub.uninstalled = false
  },
})
