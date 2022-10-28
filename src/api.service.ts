import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'
import { TRAKON_API_BASE, TRAKON_UI_BASE } from './api.constants'
import env from './env'

export const loadTrakonCredentials = () => {
  const credentialPath = path.join(os.homedir(), '.trakon-credentials')
  if (fs.existsSync(credentialPath)) {
    return fs.readFileSync(credentialPath, 'utf8').trim()
  }
  return undefined
}

export const createUploadUrl = async () => {
  const url = `${TRAKON_API_BASE}/snapshot-upload-urls`
  const result = await axios.post<{ uploadUrl: string; id: string }>(url)
  return result.data
}

export const checkAccessToken = async () => {
  const url = `${TRAKON_API_BASE}/viewer`
  const result = await axios.get<{ data: { ethAccount: string } }>(url, {
    headers: { 'x-api-key': env.API_KEY },
  })
  return result?.data.data.ethAccount ?? false
}

export const submitReview = async (compilationResult: any) => {
  const compilations = [compilationResult]
  const uploadUrlResponse = await createUploadUrl()
  await axios.put<{ id: string }>(
    uploadUrlResponse.uploadUrl,
    JSON.stringify({ compilations }, null, 2),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    },
  )

  const result = await axios.post<{ slug: string }>(
    `${TRAKON_API_BASE}/reviews/from-upload`,
    { uploadId: uploadUrlResponse.id, publicAccessLevel: 'NONE', roles: [] },
    { headers: { 'x-api-key': env.API_KEY } },
  )

  const url = `${TRAKON_UI_BASE}/reviews/${result?.data.slug}`
  return { url }
}
