/* eslint-disable prefer-arrow/prefer-arrow-functions, no-var, @typescript-eslint/no-unused-vars, no-caller */

declare const dump: (msg: string) => void
declare const Components: any
declare const ChromeUtils: any
declare var Services: any
const {
  interfaces: Ci,
  results: Cr,
  utils: Cu,
  Constructor: CC,
} = Components

if (typeof Zotero == 'undefined') {
  var Zotero
}

function log(msg) {
  Zotero.debug(`EdTechHub: (bootstrap) ${msg}`)
}

// In Zotero 6, bootstrap methods are called before Zotero is initialized, and using include.js
// to get the Zotero XPCOM service would risk breaking Zotero startup. Instead, wait for the main
// Zotero window to open and get the Zotero object from there.
//
// In Zotero 7, bootstrap methods are not called until Zotero is initialized, and the 'Zotero' is
// automatically made available.
async function waitForZotero() {
  if (typeof Zotero != 'undefined') {
    await Zotero.initializationPromise
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm')
  var windows = Services.wm.getEnumerator('navigator:browser')
  var found = false
  while (windows.hasMoreElements()) {
    const win = windows.getNext()
    if (win.Zotero) {
      Zotero = win.Zotero
      found = true
      break
    }
  }
  if (!found) {
    await new Promise(resolve => {
      var listener = {
        onOpenWindow(aWindow) {
          // Wait for the window to finish loading
          const domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
            .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow)
          domWindow.addEventListener('load', function() {
            domWindow.removeEventListener('load', arguments.callee, false)
            if (domWindow.Zotero) {
              Services.wm.removeListener(listener)
              Zotero = domWindow.Zotero
              resolve(undefined)
            }
          }, false)
        },
      }
      Services.wm.addListener(listener)
    })
  }
  await Zotero.initializationPromise
}


// Loads default preferences from prefs.js in Zotero 6
function setDefaultPrefs(rootURI) {
  var branch = Services.prefs.getDefaultBranch('')
  var obj = {
    pref(pref, value) {
      switch (typeof value) {
        case 'boolean':
          branch.setBoolPref(pref, value)
          break
        case 'string':
          branch.setStringPref(pref, value)
          break
        case 'number':
          branch.setIntPref(pref, value)
          break
        default:
          Zotero.logError(`Invalid type '${typeof(value)}' for pref '${pref}'`)
      }
    },
  }
  Services.scriptloader.loadSubScript(`${rootURI}prefs.js`, obj)
}


export async function install(): Promise<void> {
  await waitForZotero()
  log('Installed')
}

export async function startup({ id, version, resourceURI, rootURI = resourceURI.spec }): Promise<void> {
  await waitForZotero()

  log('Starting')

  // 'Services' may not be available in Zotero 6
  if (typeof Services == 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm')
  }

  // Read prefs from prefs.js when the plugin in Zotero 6
  if (Zotero.platformMajorVersion < 102) { // eslint-disable-line @typescript-eslint/no-magic-numbers
    setDefaultPrefs(rootURI)
  }

  // Add DOM elements to the main Zotero pane
  try {
    log('loading lib')
    Services.scriptloader.loadSubScript(`${rootURI}lib.js`, { Zotero })
    Zotero.EdTechHub.startup()
  }
  catch (err) {
    log(`EdTechHub: startup error: ${err}`)
  }
}

export function shutdown() {
  log('Shutting down')

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

export function uninstall() {
  // `Zotero` object isn't available in `uninstall()` in Zotero 6, so log manually
  if (typeof Zotero == 'undefined') {
    dump('EdTechHub: Uninstalled\n\n')
    return
  }

  log('Uninstalled')
}
