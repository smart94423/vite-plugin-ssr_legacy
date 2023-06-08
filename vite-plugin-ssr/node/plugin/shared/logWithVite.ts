export { logWithVite }
export { clearScreenWithVite }
export { addErrorIntroMsg }
export type { LogInfoArgs }

import pc from '@brillout/picocolors'
import type { ResolvedConfig } from 'vite'
import { isRenderErrorPageException } from '../../../shared/route/RenderErrorPage'
import { getViteConfig } from '../../runtime/globalContext'
import { LogErrorArgs, logError_set, logInfo_set, prodLogError } from '../../runtime/renderPage/logger'
import { isFirstViteLog } from '../plugins/devConfig/customClearScreen'
import { assert, assertIsVitePluginCode, isObject, isUserHookError, projectInfo } from '../utils'

assertIsVitePluginCode()
logInfo_set(logWithVite)
logError_set(logErrorWithVite)

type LogInfoArgs = Parameters<typeof logWithVite>
const introMsgs = new WeakMap<object, LogInfoArgs>()
let screenHasErrors = false

function logWithVite(
  msg: string,
  category: 'config' | `request(${number})` | null,
  type: 'error-recover' | 'error' | 'info',
  options: { clearErrors?: boolean; clearIfFirstLog?: boolean } = {}
) {
  {
    let tag = pc.yellow(pc.bold(`[${projectInfo.projectName}]`))
    if (category) {
      tag = tag + pc.dim(`[${category}]`)
    }
    msg = `${tag} ${msg}`
    msg = `${pc.dim(new Date().toLocaleTimeString())} ${msg}`
  }
  const viteConfig = getViteConfig()
  assert(viteConfig)
  const logType = type === 'info' ? 'info' : 'error'
  const clear = (options.clearErrors && screenHasErrors) || (options.clearIfFirstLog && isFirstViteLog)
  if (clear) {
    clearScreenWithVite(viteConfig)
  }
  viteConfig.logger[logType](msg)
}
function clearScreenWithVite(viteConfig: ResolvedConfig) {
  screenHasErrors = false
  viteConfig.logger.clearScreen('error')
}

function logErrorWithVite(...[err, { httpRequestId, canBeViteUserLand }]: LogErrorArgs) {
  if (isRenderErrorPageException(err)) {
    assert(canBeViteUserLand)
    return
  }
  screenHasErrors = true
  logErrorIntro(err, httpRequestId)
  if (isObject(err)) {
    if ('_esbuildMessageFormatted' in err) {
      console.error(err._esbuildMessageFormatted)
      return
    }
  }
  prodLogError(err, { httpRequestId, canBeViteUserLand })
}
function logErrorIntro(err: unknown, httpRequestId: number | null) {
  if (!isObject(err)) return
  if (introMsgs.has(err)) {
    const logInfoArgs = introMsgs.get(err)!
    logWithVite(...logInfoArgs)
    return
  }
  const category = httpRequestId ? (`request(${httpRequestId})` as const) : null
  const hook = isUserHookError(err)
  if (hook) {
    const { hookName, hookFilePath } = hook
    logWithVite(pc.red(`Error thrown by hook ${hookName}() (${hookFilePath}):`), category, 'error')
    return
  }
  if (httpRequestId !== null) {
    logWithVite(pc.red('Error:'), category, 'error')
    return
  }
}

function addErrorIntroMsg(err: unknown, ...logInfoArgs: LogInfoArgs) {
  assert(isObject(err))
  introMsgs.set(err, logInfoArgs)
}
