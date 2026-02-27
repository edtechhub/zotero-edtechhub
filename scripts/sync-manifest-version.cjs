#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = process.cwd()
const packageJSONPath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'manifest.json')

const pkg = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`synced manifest.json version to ${pkg.version}`)
}
else {
  console.log(`manifest.json already at ${pkg.version}`)
}
