/* eslint-disable prefer-arrow/prefer-arrow-functions, no-var, @typescript-eslint/no-unused-vars, no-caller */

declare const Zotero: any
declare const Services: any
declare const Components: any

function log(msg: string): void {
  Zotero.debug(`EdTechHub: (bootstrap) ${msg}`)
}

async function waitForZotero(): Promise<void> {
  await Zotero.initializationPromise
}


export async function install(): Promise<void> {
  await waitForZotero()
  log('Installed')
}

let chromeHandle: any
export async function startup({ id, version, resourceURI, rootURI = resourceURI.spec }): Promise<void> {
  await waitForZotero()

  try {
    log(`Starting ${rootURI}`)

    const aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(Components.interfaces.amIAddonManagerStartup)
    const manifestURI = Services.io.newURI(`${rootURI}manifest.json`)
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      [ 'content', 'zotero-edtechhub', 'content/'                  ],
      [ 'locale' , 'zotero-edtechhub', 'en-US'   , 'locale/en-US/' ],
    ])

    log('loading lib')
    Services.scriptloader.loadSubScript(`${rootURI}lib.js`, { Zotero })
    Zotero.EdTechHub.startup()
    log('Started')
  }
  catch (err) {
    log(`EdTechHub: startup error: ${err}`)
  }
}

// Window hooks for Zotero 7+
export function onMainWindowLoad({ window }: { window: Window }): void {
  log('Main window loaded')
  if (Zotero.EdTechHub) {
    Zotero.EdTechHub.ui(window)
  }
}

export function onMainWindowUnload({ window }: { window: Window }): void {
  log('Main window unloading')
  // Cleanup is handled in shutdown
}

export function shutdown(): void {
  log('Shutting down')

  if (typeof chromeHandle !== 'undefined') {
    chromeHandle.destruct()
    chromeHandle = undefined
  }

  if (Zotero.EdTechHub) {
    try {
      Zotero.EdTechHub.shutdown()
      delete Zotero.EdTechHub
    }
    catch (err) {
      log(`shutdown error: ${err}`)
    }
  }
}

export function uninstall(): void {
  log('Uninstalled')
}
