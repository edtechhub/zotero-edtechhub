/*
  * Open Tools-Developer-Run Javascript
  * Check "Run as async function"
  * Past this file into "Code"
  * Click "run"

  The results screen should now show the number of items modified
*/

let items = []
for (const lib of libraries = Zotero.Libraries.getAll()) {
  items = items.concat(await Zotero.Items.getAll(lib.libraryID))
}

const fieldID = {
  archiveLocation: Zotero.ItemFields.getID('archiveLocation'),
  extra: Zotero.ItemFields.getID('extra'),
}

async function moveArchiveLocation(item) {
  if (! Zotero.ItemFields.isValidForType(fieldID.extra, item.itemTypeID)) return

  let save = false

  const aka = []

  let extra = (item.getField('extra') || '').split('\n')
  if (extra.length == 1 && !extra[0]) extra = []
  extra = extra.filter(line => {
    if (line.match(/^(archiveLocation|EdTechHub.ItemAlsoKnownAs):/)) {
      aka.push(line.replace(/.*:/, '').trim())
      save = save || line.startsWith('archiveLocation:')
      return false
    } else {
      return true
    }
  })

  if (Zotero.ItemFields.isValidForType(fieldID.archiveLocation, item.itemTypeID)) {
    const archiveLocation = item.getField('archiveLocation') || ''
    if (archiveLocation.match(/\b\d{7}:[A-Z\d]{8}\b/)) {
      item.setField('archiveLocation', '')
      aka.push(archiveLocation)
      save = true
    }
  }

  if (save) {
    item.setField('extra', (extra.join('\n') + `\nEdTechHub.ItemAlsoKnownAs:${aka.join(';')}`).trim())
    await item.save()
  }
  return save
}

let saved = 0
try {
  await Zotero.DB.executeTransaction(async () => {
    for (const item of items) {
      if (await moveArchiveLocation(item)) saved += 1
    }
    // throw new Error('abort')
  })
} catch (err) {
  return err.message
}
return saved
