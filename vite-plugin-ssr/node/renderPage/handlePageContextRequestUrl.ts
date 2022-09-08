export { handlePageContextRequestUrl }

import { fileExtension, doNotCreateExtraDirectory } from '../../shared/getPageContextRequestUrl'
import { baseUrl, parseUrl, assert, slice } from '../utils'

// See shared/getPageContextRequestUrl.ts
function handlePageContextRequestUrl(url: string): {
  urlWithoutPageContextRequestSuffix: string
  isPageContextRequest: boolean
} {
  if (!hasSuffix(url)) {
    return { urlWithoutPageContextRequestSuffix: url, isPageContextRequest: false }
  }
  return { urlWithoutPageContextRequestSuffix: removePageContextUrlSuffix(url), isPageContextRequest: true }
}

function hasSuffix(url: string) {
  const { pathnameOriginal, pathname } = parseUrl(url, baseUrl)
  assert(pathnameOriginal.endsWith(fileExtension) === pathname.endsWith(fileExtension), { url })
  return pathnameOriginal.endsWith(fileExtension)
}

function removePageContextUrlSuffix(url: string): string {
  const urlParsed = parseUrl(url, baseUrl)
  const { origin, searchOriginal, hashOriginal } = urlParsed
  // We cannot use `urlParsed.pathname` because it would break the `urlParsed.pathnameOriginal` value of subsequent `parseUrl()` calls.
  let pathname = urlParsed.pathnameOriginal
  assert(doNotCreateExtraDirectory === true)
  assert(pathname.endsWith(fileExtension), { url, pathname })
  assert(url === `${origin || ''}${pathname}${searchOriginal || ''}${hashOriginal || ''}`, { url })
  pathname = slice(pathname, 0, -1 * fileExtension.length)
  if (pathname === '/index') pathname = '/'
  return `${origin || ''}${pathname}${searchOriginal || ''}${hashOriginal || ''}`
}
