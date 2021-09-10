import ReactDOMServer from "react-dom/server";
import React from "react";
import { escapeInjections, dangerouslySkipEscape } from "vite-plugin-ssr";
import { PageLayout } from "./PageLayout";

export { render };
export { passToClient };

const passToClient = ["routeParams"];

function render(pageContext) {
  const { Page, routeParams } = pageContext;
  const pageHtml = ReactDOMServer.renderToString(
    <PageLayout>
      <Page routeParams={routeParams} />
    </PageLayout>
  );

  return escapeInjections`<!DOCTYPE html>
    <html>
      <body>
        <div id="page-view">${dangerouslySkipEscape(pageHtml)}</div>
      </body>
    </html>`;
}
