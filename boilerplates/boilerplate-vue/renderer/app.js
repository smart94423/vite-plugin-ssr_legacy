import { createSSRApp, h } from 'vue'
import PageWrapper from './PageWrapper.vue'

export { createApp }

function createApp(pageContext) {
  const { Page, pageProps } = pageContext
  const PageWithLayout = {
    render() {
      return h(
        PageWrapper,
        {},
        {
          default() {
            return h(Page, pageProps || {})
          }
        }
      )
    }
  }

  const app = createSSRApp(PageWithLayout)

  // We make `pageContext` available from any component, see https://vite-plugin-ssr.com/pageContext-anywhere
  app.provide('pageContext', pageContext)

  return app
}
