import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hdiegzacpokfmrtrbzch.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkaWVnemFjcG9rZm1ydHJiemNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTQ4NTcsImV4cCI6MjA4Nzk3MDg1N30.k6gUjMkaQ-bmb1B2uvSsb-sedADUWUIoTjnToTbJYeo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const BUCKET = 'pixilate-frames'

export function getFrameUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function listFrames(session: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(session, { sortBy: { column: 'name', order: 'asc' } })

  if (error || !data) return []
  return data
    .filter(f => f.name.endsWith('.jpg'))
    .map(f => `${session}/${f.name}`)
}

export async function uploadFrame(session: string, frameNumber: number, blob: Blob): Promise<string | null> {
  const path = `${session}/frame-${String(frameNumber).padStart(5, '0')}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  return path
}
