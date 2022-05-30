import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'
import { ZEPHERUS_API_BASE, ZEPHERUS_UI_BASE } from './api.constants'

export const loadTrakonCredentials = () => {
  const credentialPath = path.join(os.homedir(), '.trakon-credentials')
  if (fs.existsSync(credentialPath)) {
    return fs.readFileSync(credentialPath, 'utf8').trim()
  }
  return undefined
}

export const API_KEY = loadTrakonCredentials()

export const createUploadUrl = async () => {
  const url = `${ZEPHERUS_API_BASE}/projects/snapshot-uploads`
  const result = await axios.post<{ uploadUrl: string; id: string }>(url)
  return result.data
}

export const checkAccessToken = async () => {
  const url = `${ZEPHERUS_API_BASE}/viewer`
  const result = await axios
    .get<{ data: { ethAccount: string } }>(url, {
      headers: { authorization: `bearer ${API_KEY}` },
    })
    .catch((err) => console.error(err))
  return result?.data.data.ethAccount ?? false
}

export const submitSnapshot = async (
  compilationResult: any,
  projectId?: string,
) => {
  const uploadUrlResponse = await createUploadUrl()
  await axios.put<{ id: string }>(
    uploadUrlResponse.uploadUrl,
    JSON.stringify(compilationResult, null, 2),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    },
  )

  const snapshotResponse = projectId
    ? await axios.put<{ project: { id: string } }>(
        `${ZEPHERUS_API_BASE}/projects/${projectId}/snapshots`,
        { uploadId: uploadUrlResponse.id },
        { headers: { authorization: `bearer ${API_KEY}` } },
      )
    : await axios.post<{ project: { id: string } }>(
        `${ZEPHERUS_API_BASE}/projects`,
        {
          uploadId: uploadUrlResponse.id,
        },
      )

  const url = `${ZEPHERUS_UI_BASE}/projects/${snapshotResponse.data.project.id}`
  return { ...snapshotResponse.data, isClaimed: !!projectId, url }
}
