export { preparePageContextForRelease }
export type { PageContextPublic }

import { assert, isPlainObject, isObject } from '../utils'
import { sortPageContext } from '../../../shared/sortPageContext'
import { assertURLs, PageContextUrls } from '../../../shared/addComputedUrlProps'
import type { PageConfig } from '../../../shared/page-configs/PageConfig'
import { addIs404ToPageProps } from '../../../shared/addIs404ToPageProps'
import type { ConfigList, ExportsAll } from '../../../shared/getPageFiles/getExports'

type PageContextPublic = {
  urlOriginal: string
  /** @deprecated */
  url: string
  urlPathname: string
  urlParsed: PageContextUrls['urlParsed']
  routeParams: Record<string, string>
  Page: unknown
  pageExports: Record<string, unknown>
  config: Record<string, unknown>
  configList: ConfigList
  exports: Record<string, unknown>
  exportsAll: ExportsAll
  _pageId: string
  _pageConfigs: PageConfig[]
  is404: null | boolean
  isClientSideNavigation: boolean
  pageProps?: Record<string, unknown>
}
function preparePageContextForRelease<T extends PageContextPublic>(pageContext: T): void {
  assertURLs(pageContext)

  assert(isPlainObject(pageContext.routeParams))
  assert('Page' in pageContext)
  assert(isObject(pageContext.pageExports))
  assert(isObject(pageContext.exports))
  assert(isObject(pageContext.exportsAll))

  assert(typeof pageContext.isClientSideNavigation === 'boolean')

  sortPageContext(pageContext)

  addIs404ToPageProps(pageContext)
}
