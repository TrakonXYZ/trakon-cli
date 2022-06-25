import fs from 'fs'
import os from 'os'
import path from 'path'
import axios, { AxiosResponse } from 'axios'
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
  const url = `${TRAKON_API_BASE}/projects/snapshot-uploads`
  const result = await axios.post<{ uploadUrl: string; id: string }>(url)
  return result.data
}

export const checkAccessToken = async () => {
  const url = `${TRAKON_API_BASE}/viewer`
  const result = await axios.get<{ data: { ethAccount: string } }>(url, {
    headers: { authorization: `bearer ${env.API_KEY}` },
  })
  return result?.data.data.ethAccount ?? false
}

export const getProjects = async ({
  limit,
  offset,
}: {
  limit: number
  offset: number
}) => {
  const url = `${TRAKON_API_BASE}/projects`
  const result = await axios.get<{
    data: { name: string; slug: string }[]
    meta: { totalCount: number }
  }>(url, {
    headers: { authorization: `bearer ${env.API_KEY}` },
  })
  return {
    projects: result?.data.data,
    hasMore: limit + offset > (result?.data.meta.totalCount ?? 0),
  }
}

export const createProject = async (uploadId: string) => {
  console.log('WHAT IS THIS', uploadId)
  const url = `${TRAKON_API_BASE}/projects`
  const result = await axios.post<{ slug: string }>(
    url,
    { uploadId },
    {
      headers: { authorization: `bearer ${env.API_KEY}` },
    },
  )
  return result?.data.slug
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

  console.log('What is the projectId:', projectId)
  if (!projectId) {
    projectId = await createProject(uploadUrlResponse.id)
  } else {
    await axios.put<{ project: { id: string } }>(
      `${TRAKON_API_BASE}/projects/${projectId}/snapshots`,
      { uploadId: uploadUrlResponse.id },
      { headers: { authorization: `bearer ${env.API_KEY}` } },
    )
  }

  const url = `${TRAKON_UI_BASE}/projects/${projectId}`
  return { url }
}
