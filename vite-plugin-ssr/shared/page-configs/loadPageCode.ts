export { loadPageCode }

import { assert } from '../utils'
import type { PageConfig2, PageConfigLoaded } from './PageConfig'

async function loadPageCode(pageConfig: PageConfig2): Promise<PageConfigLoaded> {
  const configValues: Record<string, unknown> = {}

  await Promise.all(
    Object.entries(pageConfig.configSources).map(async ([configName, configSource]) => {
      let configValue: unknown
      if ('configValue' in configSource) {
        configValue = configSource.configValue
      }
      if ('loadCodeFile' in configSource) {
        if (!configSource.loadCodeFile) return
        const fileExports = await configSource.loadCodeFile()
        assert(Object.keys(fileExports).length === 1) // TODO: assertUsage()
        assert('default' in fileExports) // TODO: assertUsage()
        configValue = fileExports.default
      }
      configValues[configName] = configValue
    })
  )

  return {
    ...pageConfig,
    configValues
  }
}
