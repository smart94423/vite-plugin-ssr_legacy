export { determineRouteFromFilesystemPath }
export { determinePageId }
export { isRelevantConfig }
export { pickMostRelevantConfigValue }

import {
  assert,
  assertPosixPath,
  assertWarning,
  getNpmPackageImportPath,
  isNpmPackageImportPath
} from '../../../../utils'
import type { PlusValueFile, PlusConfigFile } from '../getConfigData'
import { getPageConfigValue } from './helpers'

function determineRouteFromFilesystemPath(somePath: string): string {
  const pageId = determinePageId(somePath)
  return getFilesysemRoute(pageId)
}

function determinePageId(somePath: string): string {
  assert(!somePath.includes('\\'))
  assert(somePath.startsWith('/') || isNpmPackageImportPath(somePath))

  let paths = somePath.split('/')
  assert(paths.length > 1)

  // Remove filename e.g. `+config.js`
  {
    const last = paths[paths.length - 1]!
    if (last.includes('.')) {
      paths = paths.slice(0, -1)
    }
  }

  let pageId = paths.join('/')
  if (pageId === '') pageId = '/'

  assert(pageId.startsWith('/') || isNpmPackageImportPath(pageId))
  assert(
    !pageId.endsWith('/') ||
      // Unlikely, but may happen
      pageId === '/'
  )

  return pageId
}

function isRelevantConfig(
  configPath: string, // Can be plusConfigFilePath or plusValueFilePath
  pageId: string
): boolean {
  const configApplyRoot = getFilesystemApplyRoot(removeFilename(configPath))
  const isRelevant = pageId.startsWith(configApplyRoot)
  return isRelevant
}
function removeFilename(filePath: string) {
  assertPosixPath(filePath)
  assert(filePath.startsWith('/') || isNpmPackageImportPath(filePath))
  {
    const filename = filePath.split('/').slice(-1)[0]!
    assert(filename.includes('.'))
    assert(filename.startsWith('+'))
  }
  return filePath.split('/').slice(0, -1).join('/')
}
/** Get URL determined by filesystem path */
function getFilesysemRoute(someDir: string): string {
  return getFilesystemPath(someDir, ['renderer', 'pages', 'src', 'index'])
}
/** Get root for config inheritance */
function getFilesystemApplyRoot(someDir: string): string {
  return getFilesystemPath(someDir, ['renderer'])
}
function getFilesystemPath(someDir: string, removeDirs: string[]): string {
  assertPosixPath(someDir)
  if (isNpmPackageImportPath(someDir)) {
    const importPath = getNpmPackageImportPath(someDir)
    assert(importPath)
    assert(!importPath.startsWith('/'))
    someDir = '/' + importPath
  }
  assert(someDir.startsWith('/'))

  let fsPath = someDir
    .split('/')
    .filter((p) => !removeDirs.includes(p))
    .join('/')
  if (fsPath === '') fsPath = '/'

  assert(fsPath.startsWith('/') || isNpmPackageImportPath(fsPath))
  assert(!fsPath.endsWith('/') || fsPath === '/')

  return fsPath
}

type Candidate = { plusValueFile: PlusValueFile } | { plusConfigFile: PlusConfigFile }

function pickMostRelevantConfigValue(
  configName: string,
  plusValueFilesRelevant: PlusValueFile[],
  plusConfigFilesRelevant: PlusConfigFile[]
): null | Candidate {
  const candidates: Candidate[] = []
  plusValueFilesRelevant.forEach((plusValueFile) => {
    if (plusValueFile.configName === configName) {
      candidates.push({ plusValueFile })
    }
  })
  plusConfigFilesRelevant.forEach((plusConfigFile) => {
    const configValue = getPageConfigValue(configName, plusConfigFile)
    if (configValue !== undefined) {
      candidates.push({
        plusConfigFile
      })
    }
  })

  if (candidates.length === 0) {
    return null
  }
  let winnerNow = candidates[0]!
  candidates.slice(1).forEach((candidate) => {
    const winnerNowApplyRoot = getCandidateApplyRoot(winnerNow)
    const candidateApplyRoot = getCandidateApplyRoot(candidate)
    assert(candidateApplyRoot.startsWith(winnerNowApplyRoot) || winnerNowApplyRoot.startsWith(candidateApplyRoot))
    if (candidateApplyRoot.length > winnerNowApplyRoot.length) {
      winnerNow = candidate
    }
    if (candidateApplyRoot.length === winnerNowApplyRoot.length) {
      let ignored: Candidate
      if ('plusValueFile' in candidate) {
        assert('plusConfigFile' in winnerNow)
        ignored = winnerNow
        winnerNow = candidate
      } else {
        assert('plusValueFile' in winnerNow)
        ignored = candidate
      }
      assertWarning(
        false,
        `${getCandidateDefinedAt(ignored, configName)} overriden by ${getCandidateDefinedAt(
          winnerNow,
          configName
        )}, remove one of the two`,
        { onlyOnce: false, showStackTrace: false }
      )
    }
  })
  return winnerNow
}
function getCandidateApplyRoot(candidate: Candidate): string {
  let filePath: string
  if ('plusValueFile' in candidate) {
    filePath = candidate.plusValueFile.plusValueFilePath
  } else {
    filePath = candidate.plusConfigFile.plusConfigFilePath
  }
  const candidateApplyRoot = getFilesystemApplyRoot(removeFilename(filePath))
  return candidateApplyRoot
}
function getCandidateDefinedAt(candidate: Candidate, configName: string): string {
  let configDefinedAt: string
  if ('plusValueFile' in candidate) {
    configDefinedAt = candidate.plusValueFile.plusValueFilePath
  } else {
    configDefinedAt = `${candidate.plusConfigFile.plusConfigFilePath} > ${configName}`
  }
  return configDefinedAt
}
