// server/server.js
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import rateLimit from 'express-rate-limit'

dotenv.config()
const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const PORT = process.env.PORT || 4000
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = process.env.SUPABASE_BUCKET || 'data'

// sanity checks
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

// Supabase admin client using service_role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

// CORS: atur origin sesuai frontend Anda
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}))

// small middleware to extract supabase access token from Authorization header
function extractAccessToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization
  if (!h) return null
  const parts = h.split(' ')
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1]
  return null
}

// Route: upload & insert product (authenticated)
app.post('/upload-product', upload.single('file'), async (req, res) => {
  try {
    // verify incoming
    const token = extractAccessToken(req)
    if (!token) return res.status(401).json({ error: 'Missing authorization token' })

    // validate fields
    const { name, price } = req.body
    if (!name) return res.status(400).json({ error: 'Missing product name' })

    // verify user token using Admin client
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      console.error('auth.getUser failed', userErr)
      return res.status(401).json({ error: 'Invalid token' })
    }
    const user = userData.user
    const vendorId = user.id

    // file may be optional (produk tanpa gambar)
    let imageUrl = null
    if (req.file) {
      const file = req.file
      // basic validations (size limit 5MB example)
      const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024)
      if (file.size > MAX_BYTES) return res.status(400).json({ error: 'File too large' })

      const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`
      const filepath = `vendors/${vendorId}/products/${filename}`

      // upload using admin client (service_role)
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(filepath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        })

      if (uploadError) {
        console.error('storage.upload error', uploadError)
        return res.status(500).json({ error: uploadError.message || uploadError })
      }

      // get public url (or create signed url if private)
      const { data: publicData, error: publicErr } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filepath)
      if (publicErr) {
        console.warn('getPublicUrl err', publicErr)
      }
      if (publicData?.publicUrl) imageUrl = publicData.publicUrl
      else {
        const { data: signedData, error: signedErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(filepath, 60 * 60)
        if (signedErr) {
          console.error('createSignedUrl err', signedErr)
        } else {
          imageUrl = signedData.signedUrl
        }
      }
    }

    // Insert product row using admin client (service_role) -> bypass RLS safely on server
    const payload = {
      vendor_id: vendorId,
      name,
      price: price ? Number(price) : null,
      image_url: imageUrl
    }

    const { data: insertData, error: insertErr } = await supabaseAdmin.from('products').insert([payload]).select().single()
    if (insertErr) {
      console.error('insert product error', insertErr)
      return res.status(500).json({ error: insertErr.message || insertErr })
    }

    return res.json({ success: true, product: insertData, imageUrl })
  } catch (e) {
    console.error('unexpected', e)
    return res.status(500).json({ error: String(e) })
  }
})

// optional: upload-only endpoint (returns path/publicUrl) - still requires auth token
app.post('/upload-only', upload.single('file'), async (req, res) => {
  try {
    const token = extractAccessToken(req)
    if (!token) return res.status(401).json({ error: 'Missing authorization token' })

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' })
    const vendorId = userData.user.id

    if (!req.file) return res.status(400).json({ error: 'file required' })
    const file = req.file
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`
    const filepath = `vendors/${vendorId}/products/${filename}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(filepath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    })
    if (uploadError) return res.status(500).json({ error: uploadError.message || uploadError })

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filepath)
    const imageUrl = publicData?.publicUrl ?? null
    return res.json({ path: filepath, imageUrl })
  } catch (e) {
    console.error('upload-only unexpected', e)
    return res.status(500).json({ error: String(e) })
  }
})

// limiter: 12 requests per minute per IP (konfigurable)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // max 100 request / IP
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(limiter)

// Add both /vendor/:id/online and /api/vendor/:id/online as aliases
app.post(['/vendor/:id/online', '/api/vendor/:id/online'], limiter, async (req, res) => {
  try {
    // extract token (assumes you have extractAccessToken helper)
    const token = extractAccessToken(req)
    if (!token) return res.status(401).json({ error: 'Missing authorization token' })

    // validate token -> get user via supabaseAdmin
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      console.error('auth.getUser failed', userErr)
      return res.status(401).json({ error: 'Invalid token' })
    }
    const user = userData.user
    const vendorId = req.params.id

    // read vendor row to check ownership (vendors.user_id)
    const { data: vendorRow, error: vendorErr } = await supabaseAdmin
      .from('vendors')
      .select('id, user_id, online')
      .eq('id', vendorId)
      .maybeSingle()

    if (vendorErr) {
      console.error('read vendor error', vendorErr)
      return res.status(500).json({ error: 'Failed to read vendor' })
    }
    if (!vendorRow) {
      return res.status(404).json({ error: 'Vendor not found' })
    }

    // ownership: vendor.user_id must equal authenticated user id
    if (!vendorRow.user_id || vendorRow.user_id !== user.id) {
      return res.status(403).json({ error: 'Not allowed: you are not owner of this vendor' })
    }

    // determine requested online state:
    // - if req.body.online provided, use it (boolean)
    // - else toggle (flip) current value
    let online = null
    if (req.body && typeof req.body.online !== 'undefined') {
      online = Boolean(req.body.online)
    } else {
      online = !Boolean(vendorRow.online)
    }

    // update vendors table (service role)
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('vendors')
      .update({ online })
      .eq('id', vendorId)
      .select()
      .maybeSingle()

    if (updateErr) {
      console.error('update vendor online error', updateErr)
      return res.status(500).json({ error: 'Failed to update vendor status' })
    }

    return res.json({ ok: true, online: updated?.online ?? online, vendor: updated })
  } catch (e) {
    console.error('vendor online endpoint unexpected', e)
    return res.status(500).json({ error: String(e) })
  }
})
// --- end vendor online endpoint ---

app.get('/', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Upload server listening on ${PORT}`)
})
