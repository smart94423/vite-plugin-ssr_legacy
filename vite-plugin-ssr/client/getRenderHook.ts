export { executeOnClientRender }

import { assert, assertUsage, callHookWithTimeout, hasProp } from './utils'
import { assertHook } from '../shared/getHook'
import type { PageFile, PageContextExports } from '../shared/getPageFiles'
import { type PageContextRelease, releasePageContext } from './releasePageContext'

async function executeOnClientRender<
  PC extends {
    _pageFilesLoaded: PageFile[]
    urlOriginal?: string
    _pageId: string
  } & PageContextExports &
    PageContextRelease
>(pageContext: PC, isClientRouter: boolean): Promise<void> {
  const pageContextReadyForRelease = releasePageContext(pageContext, isClientRouter)

  // const renderHook = pageContext.exports.render

  if (!hasProp(pageContext.exports, 'render')) {
    const pageClientsFilesLoaded = pageContext._pageFilesLoaded.filter((p) => p.fileType === '.page.client')
    let errMsg: string
    if (pageClientsFilesLoaded.length === 0) {
      let url: string | undefined
      try {
        url = pageContext.urlOriginal
      } catch {}
      url = url ?? window.location.href
      errMsg = 'No file `*.page.client.*` found for URL ' + url // TODO
    } else {
      errMsg =
        'One of the following files should export a `render()` hook: ' + // TODO
        pageClientsFilesLoaded.map((p) => p.filePath).join(' ')
    }
    assertUsage(false, errMsg)
  }

  assertHook(pageContext, 'render')

  const hookFilePath = pageContext.exportsAll.render![0]!.filePath
  assert(hookFilePath)
  // We don't use a try-catch wrapper because rendering errors are usually handled by the UI framework. (E.g. React's Error Boundaries.)
  const hookResult = await callHookWithTimeout(
    () => pageContext.exports.render!(pageContextReadyForRelease),
    'render',
    hookFilePath
  )
  assertUsage(hookResult === undefined, `The render() hook of ${hookFilePath} isn't allowed to return a value`)
}
