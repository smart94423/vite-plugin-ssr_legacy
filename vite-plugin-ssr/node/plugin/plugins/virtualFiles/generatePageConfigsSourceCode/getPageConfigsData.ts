export { loadPageConfigsData }

import {
  determinePageId2,
  determineRouteFromFilesystemPath
} from '../../../../../shared/route/deduceRouteStringFromFilesystemPath'
import {
  assertPosixPath,
  assert,
  isObject,
  assertUsage,
  isPosixPath,
  toPosixPath,
  assertWarning,
  addFileExtensionsToRequireResolve,
  assertDefaultExport,
  objectEntries,
  hasProp,
  scriptFileExtensions,
  transpileAndLoadScriptFile,
  objectAssign
} from '../../../utils'
import path from 'path'
import type {
  ConfigName,
  ConfigSource,
  PageConfigData,
  PageConfigGlobal
} from '../../../../../shared/page-configs/PageConfig'
import { configDefinitionsBuiltIn, type ConfigDefinition } from './configDefinitionsBuiltIn'
import glob from 'fast-glob'

type ConfigDefinitionsAll = Record<string, ConfigDefinition>

async function loadPageConfigsData(
  userRootDir: string,
  isDev: boolean
): Promise<{ pageConfigsData: PageConfigData[]; pageConfigGlobal: PageConfigGlobal }> {
  const result = await findAndLoadPageConfigFiles1(userRootDir)
  /* TODO: - remove this if we don't need this for optimizeDeps.entries
   *       - also remove whole result.err try-catch mechanism, just let esbuild throw instead
  if ('err' in result) {
    return ['export const pageConfigs = null;', 'export const pageConfigGlobal = null;'].join('\n')
  }
  */
  if ('err' in result) {
    handleBuildError(result.err, isDev)
    assert(false)
  }
  const { pageConfigFiles } = result

  const configValueFiles = await findAndLoadConfigValueFiles(
    // TODO: pass configDefinitionsAll instead
    configDefinitionsBuiltIn,
    userRootDir
  )

  const pageConfigGlobal: PageConfigGlobal = {}
  const pageConfigsData: PageConfigData[] = []

  const pageIds: {
    pageId2: string
    routeFilesystem: string
    pageConfigFile: null | PageConfigFile
    routeFilesystemDefinedBy: string
  }[] = []
  pageConfigFiles
    .filter((p) => isDefiningPage(p))
    .forEach((pageConfigFile) => {
      const { pageConfigFilePath } = pageConfigFile
      const pageId2 = determinePageId2(pageConfigFilePath)
      const routeFilesystem = determineRouteFromFilesystemPath(pageConfigFilePath)
      pageIds.push({
        pageId2,
        routeFilesystem,
        pageConfigFile,
        routeFilesystemDefinedBy: pageConfigFilePath
      })
    })
  configValueFiles.map(({ configValueFilePath }) => {
    const pageId2 = determinePageId2(configValueFilePath)
    const routeFilesystem = determineRouteFromFilesystemPath(configValueFilePath)
    assertPosixPath(configValueFilePath)
    const routeFilesystemDefinedBy = path.posix.dirname(configValueFilePath) + '/'
    assert(!routeFilesystemDefinedBy.endsWith('//'))
    {
      const alreadyIncluded = pageIds.some((p) => {
        if (p.pageId2 === pageId2) {
          assert(p.routeFilesystem === routeFilesystem)
          return true
        }
        return false
      })
      if (alreadyIncluded) return
    }
    pageIds.push({
      pageId2,
      routeFilesystem,
      pageConfigFile: null,
      routeFilesystemDefinedBy
    })
  })

  pageIds.forEach(({ pageId2, routeFilesystem, pageConfigFile, routeFilesystemDefinedBy }) => {
    const pageConfigFilesRelevant = getPageConfigFilesRelevant(pageId2, pageConfigFiles)
    const configDefinitionsAll = getConfigDefinitionsAll(pageConfigFilesRelevant)

    if (pageConfigFile) {
      const pageConfigValues = getPageConfigValues(pageConfigFile)
      Object.keys(pageConfigValues).forEach((configName) => {
        // TODO: this applies only against concrete config files, we should also apply to abstract config files
        assertUsage(
          configName in configDefinitionsAll || configName === 'configDefinitions',
          `${pageConfigFile.pageConfigFilePath} defines an unknown config '${configName}'`
        )
      })
    }

    const configSources: PageConfigData['configSources'] = {}
    configValueFiles.forEach((configValueFile) => {
      if (configValueFile.pageId !== pageId2) return
      const { configName, configValueFilePath } = configValueFile
      const configDef = configDefinitionsAll[configName]
      assert(configDef)
      const configSource: ConfigSource = {
        c_env: configDef.c_env,
        // TODO: rename codeFilePath2 to configValueFilePath?
        codeFilePath2: configValueFilePath,
        configFilePath2: null,
        configSrc: `${configValueFilePath} > \`export default\``,
        configDefinedByFile: configValueFilePath
      }
      if ('configValue' in configValueFile) {
        configSource.configValue = configValueFile.configValue
      }
      configSources[configName as ConfigName] = configSource
    })

    objectEntries(configDefinitionsAll).forEach(([configName, configDef]) => {
      const result = resolveConfig(configName, configDef, pageConfigFilesRelevant, userRootDir)
      if (!result) return
      if (configName in configSources) {
        assertUsage(false, 'Defined twice ... TODO')
      }
      const { c_env } = configDef
      const { configValue, codeFilePath, configFilePath } = result
      if (!codeFilePath) {
        configSources[configName as ConfigName] = {
          configFilePath2: configFilePath,
          configSrc: `${configFilePath} > ${configName}`,
          configDefinedByFile: configFilePath,
          codeFilePath2: null,
          c_env,
          configValue
        }
      } else {
        assertUsage(
          typeof configValue === 'string',
          `${getErrorIntro(
            configFilePath,
            configName
          )} to a value with a wrong type \`${typeof configValue}\`: it should be a string instead`
        )
        configSources[configName as ConfigName] = {
          configFilePath2: configFilePath,
          codeFilePath2: codeFilePath,
          configSrc: `${codeFilePath} > \`export default\``,
          configDefinedByFile: codeFilePath,
          c_env
        }
      }
    })

    const isErrorPage: boolean = !!configSources.isErrorPage?.configValue

    pageConfigsData.push({
      pageId2,
      isErrorPage,
      routeFilesystemDefinedBy,
      pageConfigFilePathAll: pageConfigFilesRelevant.map((p) => p.pageConfigFilePath),
      routeFilesystem: isErrorPage ? null : routeFilesystem,
      configSources
    })
  })

  return { pageConfigsData, pageConfigGlobal }
}

function resolveConfig(
  configName: string,
  configDef: ConfigDefinition,
  pageConfigFilesRelevant: PageConfigFile[],
  userRootDir: string
) {
  const result = getConfigValue(configName, pageConfigFilesRelevant)
  if (!result) return null
  const { pageConfigValue, pageConfigValueFilePath } = result
  const configValue = pageConfigValue
  const configFilePath = pageConfigValueFilePath
  const { c_code, c_validate } = configDef
  const codeFilePath = getCodeFilePath(pageConfigValue, pageConfigValueFilePath, userRootDir, configName, c_code)
  assert(codeFilePath || !c_code) // TODO: assertUsage() or remove
  if (c_validate) {
    const commonArgs = { configFilePath }
    if (codeFilePath) {
      assert(typeof configValue === 'string')
      c_validate({ configValue, codeFilePath, ...commonArgs })
    } else {
      c_validate({ configValue, ...commonArgs })
    }
  }
  return { configValue, configFilePath, codeFilePath }
}

function isDefiningPage(pageConfigFile: PageConfigFile): boolean {
  const pageConfigValues = getPageConfigValues(pageConfigFile)
  return !!pageConfigValues.Page || !!pageConfigValues.route || !!pageConfigValues.isErrorPage
}

function getCodeFilePath(
  configValue: unknown,
  pageConfigFilePath: string,
  userRootDir: string,
  configName: string,
  enforce: undefined | boolean
): null | string {
  if (typeof configValue !== 'string') {
    assertUsage(
      !enforce,
      `${getErrorIntro(
        pageConfigFilePath,
        configName
      )} to a value with an invalid type \`${typeof configValue}\` but it should be a \`string\` instead`
    )
    return null
  }

  let codeFilePath = getVitePathFromConfigValue(toPosixPath(configValue), pageConfigFilePath)
  assertPosixPath(userRootDir)
  assertPosixPath(codeFilePath)
  codeFilePath = path.posix.join(userRootDir, codeFilePath)
  const clean = addFileExtensionsToRequireResolve()
  let fileExists: boolean
  try {
    codeFilePath = require.resolve(codeFilePath)
    fileExists = true
  } catch {
    fileExists = false
  } finally {
    clean()
  }
  codeFilePath = toPosixPath(codeFilePath)

  if (!enforce && !fileExists) return null
  assertCodeFilePathConfigValue(configValue, pageConfigFilePath, codeFilePath, fileExists, configName)

  // Make relative to userRootDir
  codeFilePath = getVitePathFromAbsolutePath(codeFilePath, userRootDir)

  assert(fileExists)
  assertPosixPath(codeFilePath)
  assert(codeFilePath.startsWith('/'))
  return codeFilePath
}

function assertCodeFilePathConfigValue(
  configValue: string,
  pageConfigFilePath: string,
  codeFilePath: string,
  fileExists: boolean,
  configName: string
) {
  const errIntro = getErrorIntro(pageConfigFilePath, configName)
  const errIntro1 = `${errIntro} to the value '${configValue}'` as const
  const errIntro2 = `${errIntro1} but the value should be` as const
  const warnArgs = { onlyOnce: true, showStackTrace: false } as const

  assertUsage(fileExists, `${errIntro1} but a file wasn't found at ${codeFilePath}`)

  let configValueFixed = configValue

  if (!isPosixPath(configValueFixed)) {
    assert(configValueFixed.includes('\\'))
    configValueFixed = toPosixPath(configValueFixed)
    assert(!configValueFixed.includes('\\'))
    assertWarning(
      false,
      `${errIntro2} '${configValueFixed}' instead (replace backslashes '\\' with forward slahes '/')`,
      warnArgs
    )
  }

  if (configValueFixed.startsWith('/')) {
    const pageConfigDir = dirnameNormalized(pageConfigFilePath)
    assertWarning(
      false,
      `${errIntro2} a relative path instead (i.e. a path that starts with './' or '../') that is relative to ${pageConfigDir}`,
      warnArgs
    )
  } else if (!['./', '../'].some((prefix) => configValueFixed.startsWith(prefix))) {
    // It isn't possible to omit '../' so we can assume that the path is relative to pageConfigDir
    configValueFixed = './' + configValueFixed
    assertWarning(
      false,
      `${errIntro2} '${configValueFixed}' instead: make sure to prefix paths with './' (or '../')`,
      warnArgs
    )
  }
  {
    const filename = path.posix.basename(codeFilePath)
    configValueFixed = dirnameNormalized(configValueFixed) + filename
    const fileExt = path.posix.extname(filename)
    assertWarning(
      configValue.endsWith(filename),
      `${errIntro2} '${configValueFixed}' instead (don't omit the file extension '${fileExt}')`,
      warnArgs
    )
  }
}

function getVitePathFromConfigValue(codeFilePath: string, pageConfigFilePath: string): string {
  const pageConfigDir = dirnameNormalized(pageConfigFilePath)
  if (!codeFilePath.startsWith('/')) {
    assertPosixPath(codeFilePath)
    assertPosixPath(pageConfigFilePath)
    codeFilePath = path.posix.join(pageConfigDir, codeFilePath)
  }
  assert(codeFilePath.startsWith('/'))
  return codeFilePath
}

function getVitePathFromAbsolutePath(filePathAbsolute: string, root: string): string {
  assertPosixPath(filePathAbsolute)
  assertPosixPath(root)
  assert(filePathAbsolute.startsWith(root))
  let vitePath = path.posix.relative(root, filePathAbsolute)
  assert(!vitePath.startsWith('/') && !vitePath.startsWith('.'))
  vitePath = '/' + vitePath
  return vitePath
}

function dirnameNormalized(filePath: string) {
  assertPosixPath(filePath)
  let fileDir = path.posix.dirname(filePath)
  assert(!fileDir.endsWith('/'))
  fileDir = fileDir + '/'
  return fileDir
}

function getErrorIntro(pageConfigFilePath: string, configName: string): string {
  assert(pageConfigFilePath.startsWith('/'))
  assert(!configName.startsWith('/'))
  return `${pageConfigFilePath} sets the config ${configName}`
}

function getConfigValue(
  pageConfigName: string,
  pageConfigFilesRelevant: PageConfigFile[]
): null | { pageConfigValueFilePath: string; pageConfigValue: unknown } {
  for (const configFile of pageConfigFilesRelevant) {
    const pageConfigValues = getPageConfigValues(configFile)
    const pageConfigValue = pageConfigValues[pageConfigName]
    if (pageConfigValue !== undefined) {
      return { pageConfigValueFilePath: configFile.pageConfigFilePath, pageConfigValue }
    }
  }
  return null
}

function getPageConfigValues(pageConfigFile: PageConfigFile): Record<string, unknown> {
  const { pageConfigFilePath, pageConfigFileExports } = pageConfigFile
  assertDefaultExport(pageConfigFileExports, pageConfigFilePath)
  const pageConfigValues = pageConfigFileExports.default
  assertUsage(
    isObject(pageConfigValues),
    `${pageConfigFilePath} should export an object (it exports a \`${typeof pageConfigValues}\` instead)`
  )
  return pageConfigValues
}

function getConfigDefinitionsAll(pageConfigFilesRelevant: PageConfigFile[]): ConfigDefinitionsAll {
  const configDefinitionsAll: ConfigDefinitionsAll = { ...configDefinitionsBuiltIn }
  pageConfigFilesRelevant.forEach((pageConfigFile) => {
    const { pageConfigFilePath } = pageConfigFile
    const { configDefinitions } = getPageConfigValues(pageConfigFile)
    if (configDefinitions) {
      assertUsage(
        isObject(configDefinitions),
        `${pageConfigFilePath} sets the config 'configDefinitions' to a value with an invalid type \`${typeof configDefinitions}\`: it should be an object instead.`
      )
      objectEntries(configDefinitions).forEach(([configName, configDefinition]) => {
        assertUsage(
          isObject(configDefinition),
          `${pageConfigFilePath} sets 'configDefinitions.${configName}' to a value with an invalid type \`${typeof configDefinition}\`: it should be an object instead.`
        )

        // User can override an existing config definition
        const def = {
          ...(configDefinitionsAll[configName] as ConfigDefinition | undefined),
          ...configDefinition
        }

        // Validation
        {
          {
            const prop = 'c_env'
            const hint = `Make sure to define the 'c_env' value of '${configName}' to 'client-only', 'server-only', or 'server-and-client'.`
            assertUsage(
              prop in def,
              `${pageConfigFilePath} doesn't define 'configDefinitions.${configName}.c_env' which is required. ${hint}`
            )
            assertUsage(
              hasProp(def, prop, 'string'),
              `${pageConfigFilePath} sets 'configDefinitions.${configName}.c_env' to a value with an invalid type ${typeof def.c_env}. ${hint}`
            )
            assertUsage(
              ['client-only', 'server-only', 'server-and-client'].includes(def.c_env),
              `${pageConfigFilePath} sets 'configDefinitions.${configName}.c_env' to an invalid value '${def.c_env}'. ${hint}`
            )
          }
        }

        configDefinitionsAll[configName] = def
      })
    }
  })
  return configDefinitionsAll
}

type PageConfigFile = {
  pageConfigFilePath: string
  pageConfigFileExports: Record<string, unknown>
}

type ConfigValueFile = {
  pageId: string
  configName: string
  configValueFilePath: string
} & ({} | { configValue: unknown })
async function findAndLoadConfigValueFiles(
  configDefinitionsAll: ConfigDefinitionsAll,
  userRootDir: string
): Promise<ConfigValueFile[]> {
  const configNames = Object.keys(configDefinitionsAll)
  const pattern = configNames.map((configName) => `**/+${configName}.${scriptFileExtensions}`)
  const found = await findUserFiles(pattern, userRootDir)
  const configValueFiles: ConfigValueFile[] = await Promise.all(
    found.map(async ({ filePathAbsolute, filePathRelativeToUserRootDir }) => {
      const configName = extractConfigName(filePathRelativeToUserRootDir)
      const configDef = configDefinitionsAll[configName]
      assert(configDef)
      const configValueFile: ConfigValueFile = {
        configName,
        pageId: determinePageId2(filePathRelativeToUserRootDir),
        configValueFilePath: filePathRelativeToUserRootDir
      }
      if (configDef.c_env !== 'c_config') {
        return configValueFile
      }
      const result = await transpileAndLoadScriptFile(filePathAbsolute)
      if ('err' in result) {
        throw result.err
      }
      const fileExports = result.exports
      assertDefaultExport(fileExports, filePathRelativeToUserRootDir)
      const configValue = fileExports.default
      objectAssign(configValueFile, { configValue })
      return configValueFile
    })
  )
  return configValueFiles
}

function extractConfigName(filePath: string) {
  assertPosixPath(filePath)
  const basename = path.posix.basename(filePath).split('.')[0]!
  assert(basename.startsWith('+'))
  const configName = basename.slice(1)
  return configName
}

async function findAndLoadPageConfigFiles1(
  userRootDir: string
): Promise<{ err: unknown } | { pageConfigFiles: PageConfigFile[] }> {
  const pageConfigFilePaths = await findUserFiles(`**/+config.${scriptFileExtensions}`, userRootDir)

  const pageConfigFiles: PageConfigFile[] = []
  // TODO: make esbuild build everyting at once
  const results = await Promise.all(
    pageConfigFilePaths.map(async ({ filePathAbsolute, filePathRelativeToUserRootDir }) => {
      const result = await transpileAndLoadScriptFile(filePathAbsolute)
      if ('err' in result) {
        return { err: result.err }
      }
      return { pageConfigFilePath: filePathRelativeToUserRootDir, pageConfigFileExports: result.exports }
    })
  )
  for (const result of results) {
    if ('err' in result) {
      assert(result.err)
      return {
        err: result.err
      }
    }
  }
  results.forEach((result) => {
    assert(!('err' in result))
    const { pageConfigFilePath, pageConfigFileExports } = result
    pageConfigFiles.push({
      pageConfigFilePath,
      pageConfigFileExports
    })
  })

  return { pageConfigFiles }
}

async function findUserFiles(pattern: string | string[], userRootDir: string) {
  assertPosixPath(userRootDir)
  const timeBase = new Date().getTime()
  const result = await glob(pattern, {
    ignore: ['**/node_modules/**'],
    cwd: userRootDir,
    dot: false
  })
  const time = new Date().getTime() - timeBase
  assertWarning(
    time < 2 * 1000,
    `Crawling your user files took an unexpected long time (${time}ms). Create a new issue on vite-plugin-ssr's GitHub.`,
    {
      showStackTrace: false,
      onlyOnce: 'slow-page-files-search'
    }
  )
  const userFiles = result.map((p) => {
    p = toPosixPath(p)
    const filePathRelativeToUserRootDir = path.posix.join('/', p)
    const filePathAbsolute = path.posix.join(userRootDir, p)
    return { filePathRelativeToUserRootDir, filePathAbsolute }
  })
  return userFiles
}

function handleBuildError(err: unknown, isDev: boolean) {
  // Properly handle error during transpilation so that we can use assertUsage() during transpilation
  if (isDev) {
    throw err
  } else {
    // Avoid ugly error format:
    // ```
    // [vite-plugin-ssr:virtualModulePageFiles] Could not load virtual:vite-plugin-ssr:pageFiles:server: [vite-plugin-ssr@0.4.70][Wrong Usage] /pages/+config.ts sets the config 'onRenderHtml' to the value './+config/onRenderHtml-i-dont-exist.js' but no file was found at /home/rom/code/vite-plugin-ssr/examples/v1/pages/+config/onRenderHtml-i-dont-exist.js
    // Error: [vite-plugin-ssr@0.4.70][Wrong Usage] /pages/+config.ts sets the config 'onRenderHtml' to the value './+config/onRenderHtml-i-dont-exist.js' but no file was found at /home/rom/code/vite-plugin-ssr/examples/v1/pages/+config/onRenderHtml-i-dont-exist.js
    //     at resolveCodeFilePath (/home/rom/code/vite-plugin-ssr/vite-plugin-ssr/dist/cjs/node/plugin/plugins/generateImportGlobs/file.js:203:33)
    //     at /home/rom/code/vite-plugin-ssr/vite-plugin-ssr/dist/cjs/node/plugin/plugins/generateImportGlobs/file.js:100:38
    //     ...
    //   code: 'PLUGIN_ERROR',
    //   plugin: 'vite-plugin-ssr:virtualModulePageFiles',
    //   hook: 'load',
    //   watchFiles: [
    //     '/home/rom/code/vite-plugin-ssr/vite-plugin-ssr/dist/cjs/node/importBuild.js',
    //     '\x00virtual:vite-plugin-ssr:pageFiles:server'
    //   ]
    // }
    //  ELIFECYCLE  Command failed with exit code 1.
    // ```
    console.log('')
    console.error(err)
    process.exit(1)
  }
}

function getPageConfigFilesRelevant(pageId: string, pageConfigFiles: PageConfigFile[]) {
  const pageConfigFilesRelevant = pageConfigFiles
    .filter((p) => !isDefiningPage(p))
    .filter(({ pageConfigFilePath }) => {
      assertPosixPath(pageConfigFilePath)
      assert(pageConfigFilePath.startsWith('/'))
      const configFsRoot = pageConfigFilePath
        .split('/')
        .filter((p) => p !== 'renderer')
        .slice(0, -1) // remove filename +config.js
        .join('/')
      return pageId.startsWith(configFsRoot)
    })
  return pageConfigFilesRelevant
}
