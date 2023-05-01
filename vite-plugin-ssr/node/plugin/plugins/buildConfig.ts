export { buildConfig }

import {
  assert,
  determineOutDir,
  isObject,
  viteIsSSR,
  getFilePathAbsolute,
  addOnBeforeLogHook,
  removeFileExtention,
  unique,
  assertPosixPath
} from '../utils'
import { virtualFileIdImportUserCodeServer } from '../../shared/virtual-files/virtualFileImportUserCode'
import { getConfigData } from './importUserCode/v1-design/getConfigData'
import { getCodeFilePath, getConfigValue } from '../../../shared/page-configs/utils'
import { findPageFiles } from '../shared/findPageFiles'
import { getConfigVps } from '../../shared/getConfigVps'
import type { ResolvedConfig, Plugin, Rollup } from 'vite'
import { getVirtualFileIdImportPageCode } from '../../shared/virtual-files/virtualFileImportPageCode'
import type { PlusConfigData } from '../../../shared/page-configs/PlusConfig'
type InputOption = Rollup.InputOption

function buildConfig(): Plugin {
  return {
    name: 'vite-plugin-ssr:buildConfig',
    apply: 'build',
    enforce: 'post',
    async configResolved(config) {
      const input = {
        ...(await getEntries(config)),
        ...normalizeRollupInput(config.build.rollupOptions.input)
      }
      config.build.rollupOptions.input = input
      addLogHook()
    },
    config(config) {
      return {
        build: {
          outDir: determineOutDir(config),
          manifest: !viteIsSSR(config)
        }
        /* We cannot do this because of https://github.com/brillout/vite-plugin-ssr/issues/447
        plublicDir: !viteIsSSR(config),
        */
      }
    }
  }
}

async function getEntries(config: ResolvedConfig): Promise<Record<string, string>> {
  const pageFileEntries = await getPageFileEntries(config) // TODO/v1-release: remove
  const { plusConfigsData } = await getConfigData(config.root, false, false, (await getConfigVps(config)).extensions)
  if (viteIsSSR(config)) {
    const serverEntries = analyzeServerEntries(plusConfigsData)
    const entries = {
      pageFiles: virtualFileIdImportUserCodeServer, // TODO/next-major-release: rename to plusConfigFiles
      importBuild: resolve('dist/cjs/node/importBuild.js'), // TODO/next-major-release: remove
      ...pageFileEntries,
      ...serverEntries
    }
    return entries
  } else {
    let { hasClientRouting, hasServerRouting, clientEntries } = analyzeClientEntries(plusConfigsData, config)
    if (Object.entries(pageFileEntries).length > 0) {
      hasClientRouting = true
      hasServerRouting = true
    }
    const entries: Record<string, string> = {
      ...clientEntries,
      ...pageFileEntries
    }
    const clientRoutingEntry = resolve(`dist/esm/client/router/entry.js`)
    const serverRoutingEntry = resolve(`dist/esm/client/entry.js`)
    if (hasClientRouting) {
      entries['entries/entry-client-routing'] = clientRoutingEntry
    }
    if (hasServerRouting) {
      entries['entries/entry-server-routing'] = serverRoutingEntry
    }
    return entries
  }
}

function analyzeClientEntries(plusConfigsData: PlusConfigData[], config: ResolvedConfig) {
  let hasClientRouting = false
  let hasServerRouting = false
  let clientEntries: Record<string, string> = {}
  let clientFilePaths: string[] = []
  plusConfigsData.forEach((plusConfigData) => {
    const clientRouting = getConfigValue(plusConfigData, 'clientRouting', 'boolean')
    if (clientRouting) {
      hasClientRouting = true
    } else {
      hasServerRouting = true
    }
    {
      const { entryName, entryTarget } = getEntryFromPlusConfigData(plusConfigData, true)
      clientEntries[entryName] = entryTarget
    }
    {
      const clientFilePath = getCodeFilePath(plusConfigData, 'client')
      if (clientFilePath) {
        clientFilePaths.push(clientFilePath)
      }
    }
  })
  clientFilePaths = unique(clientFilePaths)
  clientFilePaths.forEach((pageFile) => {
    const { entryName, entryTarget } = getEntryFromFilePath(pageFile, config)
    clientEntries[entryName] = entryTarget
  })

  return { hasClientRouting, hasServerRouting, clientEntries }
}
function analyzeServerEntries(plusConfigsData: PlusConfigData[]) {
  const serverEntries: Record<string, string> = {}
  plusConfigsData.forEach((plusConfigData) => {
    const { entryName, entryTarget } = getEntryFromPlusConfigData(plusConfigData, false)
    serverEntries[entryName] = entryTarget
  })
  return serverEntries
}

// Ensure Rollup creates entries for each page file, see https://github.com/brillout/vite-plugin-ssr/issues/350
// (Otherwise the page files may be missing in the client manifest.json)
async function getPageFileEntries(config: ResolvedConfig) {
  let pageFiles = await findPageFiles(
    config,
    viteIsSSR(config) ? ['.page', '.page.server'] : ['.page', '.page.client'],
    false
  )
  const pageFileEntries: Record<string, string> = {}
  pageFiles = unique(pageFiles)
  pageFiles.forEach((pageFile) => {
    const { entryName, entryTarget } = getEntryFromFilePath(pageFile, config)
    pageFileEntries[entryName] = entryTarget
  })
  return pageFileEntries
}

function getEntryFromFilePath(filePath: string, config: ResolvedConfig) {
  assertPosixPath(filePath)
  const entryTarget = getFilePathAbsolute(filePath, config)
  assert(filePath.startsWith('/'))
  let entryName = removeFileExtention(filePath)
  entryName = prependEntriesDir(entryName)
  return { entryName, entryTarget }
}
function getEntryFromPlusConfigData(plusConfigData: PlusConfigData, isForClientSide: boolean) {
  let { pageId } = plusConfigData
  const entryTarget = getVirtualFileIdImportPageCode(pageId, isForClientSide)
  assert(pageId.startsWith('/'))
  let entryName = pageId
  entryName = prependEntriesDir(entryName)
  return { entryName, entryTarget }
}

function prependEntriesDir(entryName: string): string {
  assert(entryName.startsWith('/'))
  entryName = entryName.slice(1)
  assert(!entryName.startsWith('/'))
  entryName = `entries/${entryName}`
  return entryName
}

function resolve(filePath: string) {
  assert(filePath.startsWith('dist/'))
  // [RELATIVE_PATH_FROM_DIST] Current directory: node_modules/vite-plugin-ssr/dist/cjs/node/plugin/plugins/
  return require.resolve(`../../../../../${filePath}`)
}

function normalizeRollupInput(input?: InputOption): Record<string, string> {
  if (!input) {
    return {}
  }
  // Usually `input` is an oject, but the user can set it as a `string` or `string[]`
  if (typeof input === 'string') {
    input = [input]
  }
  if (Array.isArray(input)) {
    return Object.fromEntries(input.map((input) => [input, input]))
  }
  assert(isObject(input))
  return input
}

function addLogHook() {
  const tty = process.stdout.isTTY && !process.env.CI // Equals https://github.com/vitejs/vite/blob/193d55c7b9cbfec5b79ebfca276d4a721e7de14d/packages/vite/src/node/plugins/reporter.ts#L27
  if (!tty) return
  let lastLog: string | null = null
  ;(['stdout', 'stderr'] as const).forEach((stdName) => {
    var methodOriginal = process[stdName].write
    process[stdName].write = function (...args) {
      lastLog = String(args[0])
      return methodOriginal.apply(process[stdName], args as any)
    }
  })
  // Exhaustive list extracted from writeLine() calls at https://github.com/vitejs/vite/blob/193d55c7b9cbfec5b79ebfca276d4a721e7de14d/packages/vite/src/node/plugins/reporter.ts
  // prettier-ignore
  const viteTransientLogs = [
    'transforming (',
    'rendering chunks (',
    'computing gzip size ('
  ]
  addOnBeforeLogHook(() => {
    // Using viteTransientLogs is very conservative as clearing the current line is low risk. (We can assume that important messages, such as errors, include a trailing new line. Usually, only transient messages have no trailing new lines.)
    if (viteTransientLogs.some((s) => lastLog?.startsWith(s))) {
      process.stdout.clearLine(0)
      process.stdout.cursorTo(0)
    }
  })
}
