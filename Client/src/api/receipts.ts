import client from './client'
import type { ScanResult } from '../types/receipt'

// Upload a receipt image for AI field extraction. The server reads it with
// Gemini vision and returns the parsed fields without persisting anything —
// nothing is saved until the user confirms in the Add Entry modal.
export const scanReceipt = async (file: File): Promise<ScanResult> => {
  const form = new FormData()
  form.append('receipt', file)
  // Let the browser set the multipart boundary; do not hand-set Content-Type.
  const res = await client.post('/api/v1/expenses/scan', form)
  return res.data
}
