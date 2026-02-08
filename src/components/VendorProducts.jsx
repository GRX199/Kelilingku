// src/components/VendorProducts.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from './ToastProvider' // sesuaikan jika named/default export
const BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'data'
const SERVER_ORIGIN = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

function pushToast(toast, msg, opts = {}) {
  if (!toast) return
  if (typeof toast === 'function') return toast(msg, opts)
  if (typeof toast.push === 'function') return toast.push(msg, opts)
  console.log('[TOAST]', msg, opts)
}

export default function VendorProducts({ vendorId: propVendorId }) {
  const toast = useToast ? useToast() : null
  const { user } = useAuth()
  const vendorId = propVendorId || user?.id

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // Add form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  // Edit modal state
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editFile, setEditFile] = useState(null)
  const [editPreview, setEditPreview] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchProducts()
    // cleanup previews on unmount
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (editPreview) URL.revokeObjectURL(editPreview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId])

  async function fetchProducts() {
    if (!vendorId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProducts(data || [])
    } catch (e) {
      console.error('fetchProducts', e)
      pushToast(toast, 'Gagal memuat produk: ' + (e.message || e), { type: 'error' })
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0] || null
    setFile(f)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    if (f) setPreviewUrl(URL.createObjectURL(f))
  }

  async function addProduct(e) {
    e?.preventDefault()
    if (!vendorId) { pushToast(toast, 'Vendor tidak terdeteksi', { type: 'error' }); return }
    if (!name.trim()) { pushToast(toast, 'Nama produk wajib', { type: 'error' }); return }

    setSubmitting(true)
    try {
      // If you have server upload endpoint, use it (safer for storage permissions).
      // We'll attempt direct Supabase Storage upload if file present; otherwise insert row.
      let imageUrl = null

      if (file) {
        // try uploading to Supabase Storage
        const filePath = `vendors/${vendorId}/products/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: false })
        if (upErr) {
          console.warn('storage upload failed, trying server upload', upErr)
          // fallback: call server upload endpoint (if available)
          try {
            const session = await supabase.auth.getSession()
            const token = session?.data?.session?.access_token
            const fd = new FormData()
            fd.append('vendor_id', vendorId)
            fd.append('name', name)
            fd.append('description', description)
            fd.append('price', String(price || 0))
            fd.append('file', file)
            const resp = await fetch(`${SERVER_ORIGIN.replace(/\/$/, '')}/upload-product`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: fd
            })
            const json = await resp.json().catch(()=>({}))
            if (!resp.ok) throw new Error(json?.error || 'server upload failed')
            imageUrl = json?.imageUrl || json?.fileUrl || null
          } catch (e) {
            throw e
          }
        } else {
          // get public url
          const { data: pu } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
          imageUrl = pu?.publicUrl || null
        }
      }

      // insert product row
      const payload = {
        vendor_id: vendorId,
        name: name.trim(),
        description: description.trim() || null,
        price: price === '' ? null : Number(price),
        image_url: imageUrl
      }
      const { data, error } = await supabase.from('products').insert([payload]).select().single()
      if (error) throw error

      pushToast(toast, 'Produk berhasil ditambahkan', { type: 'success' })
      // reset form
      setName(''); setDescription(''); setPrice(''); setFile(null)
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
      // refresh
      await fetchProducts()
    } catch (e) {
      console.error('addProduct', e)
      pushToast(toast, 'Gagal tambah produk: ' + (e.message || e), { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteProduct(id) {
    if (!id) return
    if (!confirm('Hapus produk?')) return
    setDeletingId(id)
    try {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      pushToast(toast, 'Produk dihapus', { type: 'info' })
      await fetchProducts()
    } catch (e) {
      console.error('deleteProduct', e)
      pushToast(toast, 'Gagal menghapus produk: ' + (e.message || e), { type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  // --- EDIT flow ---
  function openEditModal(p) {
    setEditId(p.id)
    setEditName(p.name || '')
    setEditDescription(p.description || '')
    setEditPrice(p.price ?? '')
    setEditFile(null)
    if (editPreview) { URL.revokeObjectURL(editPreview); setEditPreview(null) }
    setEditing(true)
  }

  function onEditFileChange(e) {
    const f = e.target.files?.[0] || null
    setEditFile(f)
    if (editPreview) { URL.revokeObjectURL(editPreview); setEditPreview(null) }
    if (f) setEditPreview(URL.createObjectURL(f))
  }

  async function saveEdit(e) {
    e?.preventDefault()
    if (!editId) return
    setSubmitting(true)
    try {
      let imageUrl = null
      if (editFile) {
        const filePath = `vendors/${vendorId}/products/${Date.now()}-${editFile.name}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, editFile, { upsert: false })
        if (upErr) {
          console.warn('edit: storage upload failed, trying server', upErr)
          // fallback to server upload (if available)
          const session = await supabase.auth.getSession()
          const token = session?.data?.session?.access_token
          const fd = new FormData()
          fd.append('vendor_id', vendorId)
          fd.append('product_id', editId) // server may interpret as update
          fd.append('file', editFile)
          const resp = await fetch(`${SERVER_ORIGIN.replace(/\/$/, '')}/upload-product`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd
          })
          const json = await resp.json().catch(()=>({}))
          if (!resp.ok) throw new Error(json?.error || 'server upload failed')
          imageUrl = json?.imageUrl || json?.fileUrl || null
        } else {
          const { data: pu } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
          imageUrl = pu?.publicUrl || null
        }
      }

      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        price: editPrice === '' ? null : Number(editPrice)
      }
      if (imageUrl) payload.image_url = imageUrl

      const { data, error } = await supabase.from('products').update(payload).eq('id', editId).select().maybeSingle()
      if (error) throw error

      pushToast(toast, 'Perubahan produk disimpan', { type: 'success' })
      setEditing(false)
      setEditId(null)
      if (editPreview) { URL.revokeObjectURL(editPreview); setEditPreview(null) }
      await fetchProducts()
    } catch (e) {
      console.error('saveEdit', e)
      pushToast(toast, 'Gagal menyimpan perubahan: ' + (e.message || e), { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Produk Saya</h2>

      {/* add form */}
      <form onSubmit={addProduct} className="bg-white shadow rounded p-4 mb-6 space-y-3">
        <div><label className="block text-sm">Nama</label>
          <input className="w-full border p-2 rounded" value={name} onChange={(e)=>setName(e.target.value)} required /></div>

        <div><label className="block text-sm">Deskripsi</label>
          <textarea className="w-full border p-2 rounded" value={description} onChange={(e)=>setDescription(e.target.value)} /></div>

        <div><label className="block text-sm">Harga (Rp)</label>
          <input type="number" className="w-full border p-2 rounded" value={price} onChange={(e)=>setPrice(e.target.value)} /></div>

        <div><label className="block text-sm">Foto</label>
          <input type="file" accept="image/*" onChange={onFileChange} />
          {previewUrl && <img src={previewUrl} alt="preview" className="w-36 h-36 object-cover mt-2 rounded" />}</div>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded" disabled={submitting}>{submitting ? 'Mengunggah...' : 'Tambah'}</button>
          <button type="button" className="px-4 py-2 border rounded" onClick={() => { setName(''); setDescription(''); setPrice(''); setFile(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}}>Reset</button>
        </div>
      </form>

      {/* product list */}
      <div className="grid gap-4 sm:grid-cols-2">
        {loading ? <div>Memuat...</div> : products.length === 0 ? <div className="text-gray-500">Belum ada produk</div> :
          products.map(p => (
            <div key={p.id} className="bg-white rounded shadow overflow-hidden">
              {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-40 object-cover" /> : <div className="w-full h-40 bg-gray-100 flex items-center justify-center">No image</div>}
              <div className="p-3">
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="text-sm text-gray-600 mt-1">{p.description}</div>}
                <div className="text-gray-700 mt-2">Rp {p.price ? Number(p.price).toLocaleString() : '-'}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => openEditModal(p)} className="px-2 py-1 border rounded text-sm">Edit</button>
                  <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id} className="px-2 py-1 bg-red-50 text-red-600 rounded border text-sm">
                    {deletingId === p.id ? 'Menghapus...' : 'Hapus'}
                  </button>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(false)} />
          <div className="relative bg-white rounded shadow p-4 w-full max-w-2xl z-10">
            <h3 className="text-lg font-semibold mb-3">Edit Produk</h3>

            <form onSubmit={saveEdit} className="space-y-3">
              <div><label className="block text-sm">Nama</label>
                <input className="w-full border p-2 rounded" value={editName} onChange={(e)=>setEditName(e.target.value)} required /></div>

              <div><label className="block text-sm">Deskripsi</label>
                <textarea className="w-full border p-2 rounded" value={editDescription} onChange={(e)=>setEditDescription(e.target.value)} /></div>

              <div><label className="block text-sm">Harga (Rp)</label>
                <input type="number" className="w-full border p-2 rounded" value={editPrice} onChange={(e)=>setEditPrice(e.target.value)} /></div>

              <div><label className="block text-sm">Ganti Foto</label>
                <input type="file" accept="image/*" onChange={onEditFileChange} />
                {editPreview && <img src={editPreview} alt="preview" className="w-36 h-36 object-cover mt-2 rounded" />}</div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1 border rounded">Batal</button>
                <button type="submit" disabled={submitting} className="px-3 py-1 bg-blue-600 text-white rounded">{submitting ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
