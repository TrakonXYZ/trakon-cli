import axios from 'axios'
import { ZEPHERUS_API_BASE, ZEPHERUS_UI_BASE } from './api.constants'

export const createUploadUrl = async () => {
  const url = `${ZEPHERUS_API_BASE}/deployer/staging-uploads`
  const result = await axios.post<{ uploadUrl: string; id: string }>(url)
  return result.data
}

export const submitStaging = async (compilationResult: any) => {
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
  const stagingResponse = await axios.post<{ id: string }>(
    `${ZEPHERUS_API_BASE}/deployer/compilations`,
    { uploadId: uploadUrlResponse.id },
  )

  const claimUrl = `${ZEPHERUS_UI_BASE}/compilations/${stagingResponse.data.id}`
  return { id: stagingResponse.data.id, claimUrl }
}
