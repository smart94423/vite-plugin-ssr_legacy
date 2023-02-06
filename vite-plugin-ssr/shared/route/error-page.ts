export { getErrorPageId }
export { isErrorPageId }
export { isErrorPage }

import { assert, assertUsage } from './utils'
import type { PageConfig } from '../page-configs/PageConfig'
import type { PageFile } from '../getPageFiles'

function getErrorPageId(pageFilesAll: PageFile[], pageConfigs: PageConfig[]): string | null {
  if (pageConfigs.length > 0) {
    const errorPageConfigs = pageConfigs.filter((p) => p.isErrorPage)
    if (errorPageConfigs.length === 0) return null
    assertUsage(errorPageConfigs.length === 1, 'Only one error page can be defined')
    return errorPageConfigs[0]!.pageId2
  }
  // TODO/v1-release: remove
  const errorPageIds = pageFilesAll.map(({ pageId }) => pageId).filter((pageId) => isErrorPageId(pageId, false))
  assertUsage(
    errorPageIds.length <= 1,
    `Only one \`_error.page.js\` is allowed. Found several: ${errorPageIds.join(' ')}`
  )
  if (errorPageIds.length > 0) {
    const errorPageId = errorPageIds[0]
    assert(errorPageId)
    return errorPageId
  }
  return null
}

// TODO/v1-release: remove
function isErrorPageId(pageId: string, _isV1Design: false): boolean {
  assert(!pageId.includes('\\'))
  return pageId.includes('/_error')
}

function isErrorPage(pageId: string, pageConfigs: PageConfig[]): boolean {
  if (pageConfigs.length > 0) {
    const pageConfig = pageConfigs.find((p) => p.pageId2 === pageId)
    assert(pageConfig)
    return pageConfig.isErrorPage
  } else {
    return isErrorPageId(pageId, false)
  }
}
