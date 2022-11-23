export { render }
export { passToClient }

import React from 'react'
import { renderToString } from 'react-dom/server'
import { escapeInject, dangerouslySkipEscape, type InjectFilterEntry } from '../../../vite-plugin-ssr/node'
// @ts-ignore
import { PageLayout } from './PageLayout'

// See https://vite-plugin-ssr.com/data-fetching
const passToClient = ['pageProps']

async function render(pageContext: any) {
  const { Page, pageProps } = pageContext
  const { preloadStrategy } = pageContext.exports
  const pageHtml = renderToString(
    <PageLayout>
      <Page {...pageProps} />
    </PageLayout>
  )

  const documentHtml = escapeInject`<!DOCTYPE html>
    <html>
      <body>
        <div id="page-view">${dangerouslySkipEscape(pageHtml)}</div>
      </body>
    </html>`

  return {
    documentHtml,
    injectFilter(assets: InjectFilterEntry[]) {
      // Default vite-plugin-ssr's preloading strategy
      if (!preloadStrategy) return

      if (preloadStrategy === 'DISABLED') {
        assets.forEach((asset) => {
          if (
            // We don't touch entry assets (recommended)
            asset.isEntry ||
            // We don't touch JavaScript preloading (recommended)
            asset.assetType === 'script'
          ) {
            return
          }
          asset.inject = false
        })
      }

      if (preloadStrategy === 'ONLY_FONT') {
        assets.forEach((asset) => {
          if (
            // We don't touch entry assets (recommended)
            asset.isEntry ||
            // We don't touch JavaScript preloading (recommended)
            asset.assetType === 'script'
          ) {
            return
          }
          asset.inject = asset.assetType !== 'font' ? false : 'HTML_BEGIN'
        })
      }
    }
  }
}
