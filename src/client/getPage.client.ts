import { getPageFile } from '../page-files/getPageFiles.shared'
import { assert, assertUsage, assertWarning } from '../utils/assert'
import { getContextPropsProxy } from './getContextPropsProxy'
import { navigationState } from './navigationState.client'

export { getPage }
export { getPageById }
export { getPageInfo }

async function getPage(): Promise<{
  Page: any
  contextProps: Record<string, any>
}> {
  let { pageId, contextProps } = getPageInfo()
  const Page = await getPageById(pageId)
  contextProps = getContextPropsProxy(contextProps)
  assertPristineUrl()
  return {
    Page,
    contextProps,
    // @ts-ignore
    get pageProps() {
      assertUsage(
        false,
        "`pageProps` in `const { pageProps } = await getPage()` has been replaced with `const { contextProps } = await getPage()`. The `setPageProps()` hook is deprecated: instead, return `pageProps` in your `addContextProps()` hook and use `passToClient = ['pageProps']` to pass `context.pageProps` to the browser. See `BREAKING CHANGE` in `CHANGELOG.md`."
      )
    }
  }
}

function assertPristineUrl() {
  assertWarning(
    navigationState.noNavigationChangeYet,
    `\`getPage()\` returned page information for URL \`${navigationState.urlOriginal}\` instead of \`${navigationState.urlCurrent}\`. If you want to be able to change the URL (e.g. with \`window.history.pushState\`) while using \`getPage()\`, then create a new GitHub issue.`
  )
}

async function getPageById(pageId: string): Promise<any> {
  assert(typeof pageId === 'string')
  const pageFile = await getPageFile('.page', pageId)
  assert(pageFile)
  const { filePath, loadFile } = pageFile
  const fileExports = await loadFile()
  assertUsage(
    typeof fileExports === 'object' && ('Page' in fileExports || 'default' in fileExports),
    `${filePath} should have a \`export { Page }\` (or a default export).`
  )
  const Page = fileExports.Page || fileExports.default
  return Page
}

function getPageInfo(): {
  pageId: string
  contextProps: Record<string, unknown>
} {
  const pageId = window.__vite_plugin_ssr.pageId
  const contextProps = window.__vite_plugin_ssr.contextProps
  return { pageId, contextProps }
}

declare global {
  interface Window {
    __vite_plugin_ssr: {
      pageId: string
      contextProps: Record<string, unknown>
    }
  }
}
