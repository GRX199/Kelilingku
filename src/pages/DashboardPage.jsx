// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import VendorProducts from '../components/VendorProducts'
import { useToast } from '../components/ToastProvider'
import { useLocation } from 'react-router-dom'

/* small tab button component */
function TabButton({ id, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-2 rounded-md text-sm font-medium ${
        active ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

/* Chat window */
function ChatWindow({ chatId, onClose, currentUser }) {
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')

  useEffect(() => {
    if (!chatId) return
    let mounted = true

    async function load() {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true })

        if (error) throw error
        if (mounted) setMessages(data || [])
      } catch (e) {
        console.error('load messages', e)
        toast.push('Gagal memuat pesan: ' + (e.message || e), { type: 'error' })
      }
    }
    load()

    const channel = supabase
      .channel(`chat-messages-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((m) => [...m, payload.new])
        }
      )
      .subscribe()

    return () => {
      mounted = false
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [chatId, toast])

  async function send() {
    if (!text.trim()) return
    try {
      const payload = { chat_id: chatId, from_user: currentUser.id, text: text.trim() }
      const { data, error } = await supabase.from('messages').insert([payload]).select().single()
      if (error) throw error
      setText('')
    } catch (e) {
      console.error('send message', e)
      toast.push('Gagal mengirim pesan: ' + (e.message || e), { type: 'error' })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b">
        <div className="text-sm font-medium">Chat</div>
        <div>
          <button onClick={onClose} className="px-2 py-1 text-sm rounded hover:bg-gray-100">Tutup</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.map((m) => {
          const mine = m.from_user === currentUser.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-2 rounded ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                <div className="text-sm">{m.text}</div>
                <div className="text-xs text-gray-400 mt-1 text-right">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 p-2 border rounded"
            placeholder="Ketik pesan..."
          />
          <button onClick={send} className="px-3 py-2 bg-blue-600 text-white rounded">Kirim</button>
        </div>
      </div>
    </div>
  )
}

/* Orders panel */
function OrdersPanel({ currentUser, role }) {
  const toast = useToast()
  const [orders, setOrders] = useState([])

  const fetchOrders = async () => {
    if (!currentUser) return
    try {
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false })
      if (role === 'vendor') q = q.eq('vendor_id', currentUser.id)
      else q = q.eq('buyer_id', currentUser.id)

      const { data, error } = await q
      if (error) throw error
      setOrders(data || [])
    } catch (e) {
      console.error('fetchOrders', e)
      toast.push('Gagal memuat pesanan: ' + (e.message || e), { type: 'error' })
    }
  }

  useEffect(() => { fetchOrders() }, [currentUser, role])

  async function updateStatus(orderId, status) {
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
      if (error) throw error
      fetchOrders()
    } catch (e) {
      console.error('update order', e)
      toast.push('Gagal mengubah status', { type: 'error' })
    }
  }

  return (
    <div className="p-3 bg-white rounded shadow h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Pesanan ({orders.length})</h3>
        <button onClick={fetchOrders} className="text-sm text-blue-600">Muat ulang</button>
      </div>

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="p-3 border rounded flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="font-medium">{o.buyer_name ?? 'Pelanggan'}</div>
              <div className="text-sm text-gray-500">{o.items ?? '-'}</div>
              <div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleString()}</div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm mr-4">Status: <span className="font-semibold">{o.status}</span></div>

              {role === 'vendor' && (
                <>
                  <button onClick={() => updateStatus(o.id, 'accepted')} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Terima</button>
                  <button onClick={() => updateStatus(o.id, 'rejected')} className="px-2 py-1 bg-red-50 text-red-600 rounded text-sm border">Tolak</button>
                </>
              )}

              {role === 'customer' && (
                <button onClick={() => updateStatus(o.id, 'cancelled')} className="px-2 py-1 bg-red-50 text-red-600 rounded text-sm border">Batalkan</button>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="text-sm text-gray-500">Belum ada pesanan</div>}
      </div>
    </div>
  )
}

/* Profile panel (keperluan sidebar & edit) */
function ProfilePanel({ currentUser, role, refreshAuth, vendorProfileState, setVendorProfileState }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', photo_url: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const SERVER_ORIGIN = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

  useEffect(() => {
    if (!currentUser) return
    async function load() {
      try {
        if (role === 'vendor') {
          const { data, error } = await supabase.from('vendors').select('*').eq('id', currentUser.id).maybeSingle()
          if (error) throw error
          setProfile(data || null)
          setForm({ name: data?.name || '', description: data?.description || '', photo_url: data?.photo_url || '' })
          setVendorProfileState && setVendorProfileState(data || null)
        } else {
          setProfile({ id: currentUser.id, name: currentUser.user_metadata?.full_name || '', email: currentUser.email, photo_url: currentUser.user_metadata?.avatar_url || '' })
          setForm({ name: currentUser.user_metadata?.full_name || '', description: '', photo_url: currentUser.user_metadata?.avatar_url || '' })
        }
      } catch (e) {
        console.error('load profile', e)
        toast.push('Gagal memuat profil', { type: 'error' })
      }
    }
    load()
  }, [currentUser, role, refreshAuth, setVendorProfileState, toast])

  async function uploadPhotoAndGetUrl(file) {
    if (!file) return null
    try {
      const sessionRes = await supabase.auth.getSession()
      const access_token = sessionRes?.data?.session?.access_token
      if (!access_token) throw new Error('Not authenticated')

      const fd = new FormData(); fd.append('file', file)
      const resp = await fetch(`${SERVER_ORIGIN}/upload-only`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}` },
        body: fd
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Upload foto gagal')
      return json.imageUrl || null
    } catch (e) {
      console.error('uploadPhotoAndGetUrl', e)
      throw e
    }
  }

  async function save() {
    if (!currentUser) return
    setLoading(true)
    try {
      let uploadedUrl = form.photo_url
      if (photoFile) {
        uploadedUrl = await uploadPhotoAndGetUrl(photoFile)
      }

      if (role === 'vendor') {
        const payload = { name: form.name, description: form.description, photo_url: uploadedUrl }
        const { data, error } = await supabase.from('vendors').update(payload).eq('id', currentUser.id).select().maybeSingle()
        if (error) throw error
        setProfile(data)
        setVendorProfileState && setVendorProfileState(data || null)
        toast.push('Profil pedagang diperbarui', { type: 'success' })
      } else {
        const { data, error } = await supabase.auth.updateUser({ data: { full_name: form.name, avatar_url: uploadedUrl } })
        if (error) throw error
        toast.push('Profil diperbarui', { type: 'success' })
        refreshAuth && refreshAuth()
      }
      setEditing(false)
      setPhotoFile(null)
    } catch (e) {
      console.error('save profile', e)
      toast.push('Gagal simpan profil: ' + (e.message || e), { type: 'error' })
    } finally { setLoading(false) }
  }

  if (!profile) return <div className="p-3 text-sm text-gray-500">Memuat profil...</div>

  return (
    <div className="p-3 bg-white rounded shadow">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
          {profile.photo_url ? <img src={profile.photo_url} alt="avatar" className="w-full h-full object-cover" /> : <div className="text-xl">{(profile.name || 'U')[0]}</div>}
        </div>
        <div>
          <div className="font-semibold">{profile.name || profile.email}</div>
          <div className="text-sm text-gray-500">{role === 'vendor' ? 'Pedagang' : 'Pelanggan'}</div>
        </div>
      </div>

      <div className="mt-4">
        {!editing ? (
          <>
            <div className="text-sm text-gray-600 mb-2">{profile.description || '-'}</div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="px-3 py-1 border rounded text-sm">Edit Profil</button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <input className="w-full p-2 border rounded" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama toko / nama" />
            <textarea className="w-full p-2 border rounded" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi"></textarea>

            <div>
              <label className="block text-sm font-medium">Ganti Foto Profil</label>
              <input type="file" accept="image/*" className="mt-1" onChange={(e) => setPhotoFile(e.target.files[0])} />
            </div>

            <div className="flex gap-2">
              <button disabled={loading} onClick={save} className="px-3 py-1 bg-blue-600 text-white rounded">Simpan</button>
              <button onClick={() => { setEditing(false); setPhotoFile(null) }} className="px-3 py-1 border rounded">Batal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- DashboardPage (main) ---------------- */
export default function DashboardPage() {
  const { user, role, loading: authLoading } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('products')

  // chat list / open chat
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // vendor profile state (for showing photo & description in sidebar)
  const [vendorProfile, setVendorProfile] = useState(null)

  // tolerant vendor check
  const isVendor = (role === 'vendor') || (user?.user_metadata?.role === 'vendor') || (user?.user_metadata?.is_vendor === true)

  const location = useLocation()

  useEffect(() => {
    // baca query param 'tab'
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab) {
      // validasi tab: products/chats/orders/profile
      const allowed = ['products', 'chats', 'orders', 'profile']
      if (allowed.includes(tab)) setActiveTab(tab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  // default active tab: for customers prefer 'chats' (hide products)
  useEffect(() => {
    if (!isVendor) setActiveTab('chats')
    else setActiveTab((prev) => (prev ? prev : 'products'))
  }, [isVendor])

  // load vendor profile if user is vendor
  useEffect(() => {
    let mounted = true
    async function loadVendorRow() {
      if (!user) return
      if (!isVendor) {
        if (mounted) setVendorProfile(null)
        return
      }
      try {
        const { data, error } = await supabase.from('vendors').select('*').eq('id', user.id).maybeSingle()
        if (error) throw error
        if (mounted) setVendorProfile(data || null)
      } catch (e) {
        console.error('load vendor row', e)
      }
    }
    loadVendorRow()
    return () => { mounted = false }
  }, [user, isVendor, refreshKey])

  useEffect(() => {
    if (!user) return
    fetchChats()
    const chan = supabase
      .channel('chats-sub-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchChats())
      .subscribe()
    return () => {
      try { supabase.removeChannel(chan) } catch {}
    }
  }, [user, refreshKey])

  async function fetchChats() {
    if (!user) return
    try {
      const { data, error } = await supabase.from('chats').select('*').contains('participants', [user.id]).order('last_updated', { ascending: false })
      if (error) throw error
      setChats(data || [])
    } catch (e) {
      console.error('fetch chats', e)
      toast.push('Gagal memuat daftar chat: ' + (e.message || e), { type: 'error' })
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (e) {
      console.error('logout', e)
      toast.push('Gagal logout', { type: 'error' })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left column: sidebar (profile + tabs vertical on large screens) */}
          <aside className="w-full lg:w-80">
            <div className="bg-white p-4 rounded shadow mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center text-xl">
                  {/* show vendor photo if vendor profile exists, otherwise fallback to user metadata avatar or initial */}
                  {isVendor && vendorProfile?.photo_url ? (
                    <img src={vendorProfile.photo_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-xl">{(user?.user_metadata?.full_name || user?.email || 'U')[0]}</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold">{(isVendor ? (vendorProfile?.name || user?.user_metadata?.full_name) : (user?.user_metadata?.full_name || user?.email))}</div>
                  <div className="text-xs text-gray-500">{user?.email}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-2">Mode</div>
                <div className="flex gap-2">
                  <div className={`px-2 py-1 rounded text-sm ${isVendor ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{isVendor ? 'Pedagang' : 'Pelanggan'}</div>
                </div>
              </div>
            </div>

            <nav className="bg-white p-3 rounded shadow">
              <div className="flex gap-2 flex-wrap">
                {isVendor && <TabButton id="products" active={activeTab === 'products'} onClick={setActiveTab}>Produk</TabButton>}
                <TabButton id="chats" active={activeTab === 'chats'} onClick={setActiveTab}>Chat</TabButton>
                <TabButton id="orders" active={activeTab === 'orders'} onClick={setActiveTab}>Pesanan</TabButton>
                <TabButton id="profile" active={activeTab === 'profile'} onClick={setActiveTab}>Profil</TabButton>
              </div>

              <div className="mt-3 text-sm text-gray-500">Tips: gunakan menu untuk berpindah antar fitur.</div>
            </nav>
          </aside>

          {/* Right column: main content */}
          <main className="flex-1">
            <div className="mb-4">
              {/* Subheader */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {activeTab === 'products' && 'Produk Saya'}
                  {activeTab === 'chats' && 'Pesan'}
                  {activeTab === 'orders' && 'Pesanan'}
                  {activeTab === 'profile' && 'Profil Saya'}
                </h2>

                <div className="flex items-center gap-2">
                  <button onClick={() => setRefreshKey((k) => k + 1)} className="px-3 py-1 text-sm rounded border">Refresh</button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {activeTab === 'products' && (
                <div>
                  {isVendor ? (
                    <VendorProducts vendorProfile={vendorProfile} />
                  ) : null /* hide products UI entirely for customers */}
                </div>
              )}

              {activeTab === 'chats' && (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                  <div className="bg-white p-3 rounded shadow">
                    <div className="font-semibold mb-2">Daftar Chat</div>
                    <div className="space-y-2">
                      {chats.map((c) => {
                        const partner = (c.participants || []).find((p) => p !== (user && user.id)) || 'User'
                        return (
                          <div key={c.id} className="p-2 border rounded flex items-center justify-between">
                            <div>
                              <div className="font-medium">{partner}</div>
                              <div className="text-xs text-gray-400">{c.last_updated ? new Date(c.last_updated).toLocaleString() : '-'}</div>
                            </div>
                            <div>
                              <button onClick={() => setSelectedChat(c.id)} className="px-2 py-1 border rounded text-sm">Buka</button>
                            </div>
                          </div>
                        )
                      })}
                      {chats.length === 0 && <div className="text-sm text-gray-500">Belum ada chat</div>}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded shadow h-[60vh]">
                    {selectedChat ? (
                      <ChatWindow chatId={selectedChat} onClose={() => setSelectedChat(null)} currentUser={user} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-gray-500">Pilih chat untuk mulai percakapan</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'orders' && (
                <OrdersPanel currentUser={user} role={role} />
              )}

              {activeTab === 'profile' && (
                <ProfilePanel currentUser={user} role={role} refreshAuth={() => { window.location.reload() }} vendorProfileState={vendorProfile} setVendorProfileState={setVendorProfile} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
