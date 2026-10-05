#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = process.cwd()
const packageJSONPath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'manifest.json')

const pkg = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const original = JSON.stringify(manifest)

manifest.version = pkg.version
manifest.applications.zotero.strict_min_version = pkg.xpi.minVersion
manifest.applications.zotero.strict_max_version = pkg.xpi.maxVersion

if (JSON.stringify(manifest) !== original) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`synced manifest.json to ${pkg.version}, Zotero ${pkg.xpi.minVersion}-${pkg.xpi.maxVersion}`)
}
else {
  console.log(`manifest.json is current at ${pkg.version}`)
}

if (process.argv.includes('--updates')) {
  const updates = {
    addons: {
      [manifest.applications.zotero.id]: {
        updates: [{
          version: manifest.version,
          update_link: pkg.xpi.updateLink.replaceAll('{version}', pkg.version),
          applications: {
            zotero: {
              strict_min_version: manifest.applications.zotero.strict_min_version,
              strict_max_version: manifest.applications.zotero.strict_max_version,
            },
          },
        }],
      },
    },
  }
  fs.writeFileSync(path.join(root, 'updates.json'), `${JSON.stringify(updates, null, 2)}\n`)
}
