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
  let extra = (item.getField('extra') || '').split('\n')
  if (extra.length == 1 && !extra[0]) extra = []
  /*
  let prevItemAlsoKnownAs = ''
  check extra for EdTechHub.ItemAlsoKnownAs
  if already there, then 
       prevItemAlsoKnownAs = value
       remove line from extra
       
  */
  if (Zotero.ItemFields.isValidForType(fieldID.archiveLocation, item.itemTypeID)) {
    const archiveLocation = item.getField('archiveLocation') || ''
    if (archiveLocation) {
    // Better if this was:
    // if (archiveLocation &&  archiveLocation.match(/\b\d{7}:[A-Z\d]{8}\b/) {
      item.setField('archiveLocation', '')
      // if (prevItemAlsoKnownAs == '') {
           extra.push(`EdTechHub.ItemAlsoKnownAs: ${archiveLocation}`)
      // } else {
      //   extra.push(`EdTechHub.ItemAlsoKnownAs: ${prevItemAlsoKnownAs};${archiveLocation}`)
      // }
      save = true
    }
  }

  extra = extra.map(line => {
    const renamed = line.replace(/^archiveLocation:/, 'EdTechHub.ItemAlsoKnownAs:')
    save = save || renamed !== line
    return renamed
  })

  if (save) {
    item.setField('extra', extra.join('\n'))
    await item.save()
  }
  return save
}

let saved = 0
await Zotero.DB.executeTransaction(async () => {
  for (const item of items) {
    if (await moveArchiveLocation(item)) saved += 1
  }
})
return saved
