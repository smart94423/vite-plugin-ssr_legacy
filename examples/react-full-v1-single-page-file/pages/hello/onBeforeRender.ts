export default onBeforeRender

import type { PageContextBuiltIn } from 'vite-plugin-ssr'
import { RenderErrorPage } from 'vite-plugin-ssr'

import { names } from './names'

async function onBeforeRender(pageContext: PageContextBuiltIn) {
  const { name } = pageContext.routeParams
  if (name !== 'anonymous' && !names.includes(name)) {
    const errorInfo = `Unknown name: ${name}.`
    throw RenderErrorPage({ pageContext: { pageProps: { errorInfo } } })
  }
  const pageProps = { name }
  return {
    pageContext: {
      pageProps
    }
  }
}
