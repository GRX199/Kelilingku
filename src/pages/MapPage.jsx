// src/pages/MapPage.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'
import { useAuth } from '../lib/auth'

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapPage() {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const clusterRef = useRef(null)
  const toast = useToast ? useToast() : { push: console.log }
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const SERVER_ORIGIN = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'

  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [radiusKm, setRadiusKm] = useState(2.5)
  const [onlyWithinRadius, setOnlyWithinRadius] = useState(false)
  const [clusterEnabled, setClusterEnabled] = useState(true)

  // detect vendor role (tolerant)
  const isVendor = (role === 'vendor') || (user?.user_metadata?.role === 'vendor') || (user?.user_metadata?.is_vendor === true)
  const myVendorId = user?.id

  // debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [query])

  // load vendors from supabase
  async function loadVendors() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, description, photo_url, location, online')
      if (error) throw error
      setVendors(data || [])
    } catch (e) {
      console.error('loadVendors', e)
      toast.push && toast.push('Gagal memuat pedagang', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) { try { mapRef.current.remove() } catch {} ; mapRef.current = null }
    const m = L.map(containerRef.current).setView([-6.200000, 106.816666], 12)
    mapRef.current = m
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m)

    const locateControl = L.control({ position: 'topleft' })
    locateControl.onAdd = function () {
      const el = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom')
      el.style.background = 'white'; el.style.padding = '6px'; el.style.cursor = 'pointer'; el.innerHTML = '📍'
      el.title = 'Tunjukkan lokasi saya'
      L.DomEvent.on(el, 'click', () => m.locate({ setView: true, maxZoom: 16 }))
      return el
    }
    locateControl.addTo(m)

    m.on('locationfound', (e) => {
      const { lat, lng } = e.latlng
      setUserLocation({ lat, lng })
      if (m._userMarker) m.removeLayer(m._userMarker)
      m._userMarker = L.circleMarker([lat, lng], { radius: 7, color: '#1976d2', fillColor: '#1976d2', fillOpacity: 0.9 }).addTo(m)
    })
    m.on('locationerror', () => { toast.push && toast.push('Tidak dapat mengakses lokasi Anda', { type: 'error' }) })

    return () => { try { m.remove() } catch {} ; mapRef.current = null }
  }, [containerRef])

  // realtime & initial load
  useEffect(() => {
    loadVendors()
    const chan = supabase.channel('vendors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => loadVendors())
      .subscribe()
    return () => { try { supabase.removeChannel(chan) } catch {} }
  }, [])

  // render markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (clusterRef.current) { try { map.removeLayer(clusterRef.current) } catch {} ; clusterRef.current = null }

    const group = clusterEnabled ? L.markerClusterGroup() : L.layerGroup()
    clusterRef.current = group

    const filtered = vendors.filter((v) => {
      if (!v.location) return false
      let lat = null, lng = null
      if (typeof v.location.lat === 'number' && typeof v.location.lng === 'number') { lat = v.location.lat; lng = v.location.lng }
      else if (v.location.type === 'Point' && Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else if (Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else return false

      if (debouncedQuery) {
        const hay = ((v.name || '') + ' ' + (v.description || '')).toLowerCase()
        if (!hay.includes(debouncedQuery)) return false
      }
      if (onlyWithinRadius) {
        if (!userLocation) return false
        const d = haversineDistance(userLocation.lat, userLocation.lng, lat, lng)
        if (d > radiusKm * 1000) return false
      }
      return true
    })

    const bounds = []
    filtered.forEach((v) => {
      let lat = null, lng = null
      if (typeof v.location.lat === 'number' && typeof v.location.lng === 'number') { lat = v.location.lat; lng = v.location.lng }
      else if (v.location.type === 'Point' && Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else if (Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else return

      const marker = L.marker([lat, lng])
      const popupHtml = `
        <div style="min-width:200px">
          <strong>${v.name || 'Pedagang'}</strong>
          <div style="font-size:12px;margin-top:4px">${v.online ? '<span style="color:green">● online</span>' : '<span style="color:gray">● offline</span>'}</div>
          ${v.photo_url ? `<div style="margin-top:6px"><img src="${v.photo_url}" style="width:100%;height:90px;object-fit:cover;border-radius:6px" /></div>` : ''}
          ${v.description ? `<div style="margin-top:6px;font-size:13px">${String(v.description).slice(0,120)}</div>` : ''}
          <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
            <button id="mp-view-${v.id}" style="padding:6px 8px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer">Profil</button>
            <button id="mp-chat-${v.id}" style="padding:6px 8px;border-radius:6px;border:1px solid #1976d2;background:#1976d2;color:#fff;cursor:pointer">Chat</button>
            <button id="mp-order-${v.id}" style="padding:6px 8px;border-radius:6px;border:1px solid #2ecc71;background:#2ecc71;color:#fff;cursor:pointer">Order</button>
          </div>
        </div>
      `
      marker.bindPopup(popupHtml, { maxWidth: 300 })
      marker.on('popupopen', () => {
        setTimeout(() => {
          const viewBtn = document.getElementById(`mp-view-${v.id}`)
          const chatBtn = document.getElementById(`mp-chat-${v.id}`)
          const orderBtn = document.getElementById(`mp-order-${v.id}`)
          if (viewBtn) viewBtn.onclick = () => setSelectedVendor(v)
          if (chatBtn) chatBtn.onclick = () => window.location.href = `/chat/${v.id}`
          if (orderBtn) orderBtn.onclick = () => {
            setSelectedVendor(v)
            window.location.href = `/vendor/${v.id}`
          }
        }, 50)
      })

      group.addLayer(marker)
      bounds.push([lat, lng])
    })

    group.addTo(map)
    if (bounds.length) {
      try { map.fitBounds(bounds, { padding: [60, 60] }) } catch {}
    }

    return () => { try { map.removeLayer(group) } catch {} ; clusterRef.current = null }
  }, [vendors, debouncedQuery, onlyWithinRadius, radiusKm, userLocation, clusterEnabled])

  // -------- optimistic toggle logic with server --------
  async function getAccessToken() {
    try {
      const res = await supabase.auth.getSession()
      return res?.data?.session?.access_token || null
    } catch (e) {
      return null
    }
  }

  // optimistic toggle: flip UI immediately, call server endpoint, revert on failure
  async function toggleMyOnlineOptimistic() {
    if (!isVendor || !myVendorId) {
      return toast.push && toast.push('Hanya pedagang yang dapat mengubah status', { type: 'error' })
    }

    const currentRow = vendors.find(v => v.id === myVendorId)
    const current = currentRow?.online === true
    const newStatus = !current

    // optimistic update
    setVendors((prev) => prev.map(v => v.id === myVendorId ? ({ ...v, online: newStatus, __updating: true }) : v))

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('User not authenticated')

      const resp = await fetch(`${SERVER_ORIGIN.replace(/\/$/, '')}/api/vendor/${myVendorId}/online`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ online: newStatus })
      })

      if (!resp.ok) {
        const jsonErr = await resp.json().catch(() => ({}))
        throw new Error(jsonErr?.error || `HTTP ${resp.status}`)
      }

      const json = await resp.json().catch(() => ({}))
      const confirmed = json?.online === undefined ? newStatus : json.online
      // apply final value
      setVendors((prev) => prev.map(v => v.id === myVendorId ? ({ ...v, online: confirmed, __updating: false }) : v))
      toast.push && toast.push(`Status: ${confirmed ? 'Online' : 'Offline'}`, { type: 'success' })
    } catch (e) {
      // revert
      setVendors((prev) => prev.map(v => v.id === myVendorId ? ({ ...v, online: current, __updating: false }) : v))
      console.error('toggleMyOnlineOptimistic', e)
      toast.push && toast.push('Gagal ubah status: ' + (e.message || e), { type: 'error' })
    }
  }

  // navigate to dashboard and open products tab
  function goToManageProducts() {
    navigate('/dashboard?tab=products', { replace: false })
  }

  // derived vendors within radius
  const vendorsWithinRadius = useMemo(() => {
    if (!userLocation) return []
    return vendors.filter((v) => {
      if (!v.location) return false
      let lat = null, lng = null
      if (typeof v.location.lat === 'number' && typeof v.location.lng === 'number') { lat = v.location.lat; lng = v.location.lng }
      else if (v.location.type === 'Point' && Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else if (Array.isArray(v.location.coordinates)) { lng = v.location.coordinates[0]; lat = v.location.coordinates[1] }
      else return false
      const d = haversineDistance(userLocation.lat, userLocation.lng, lat, lng)
      return d <= radiusKm * 1000
    })
  }, [vendors, userLocation, radiusKm])

  // UI
  const myVendorRow = vendors.find(v => v.id === myVendorId)
  const toggleLabel = myVendorRow && myVendorRow.online ? 'Jadikan Offline' : 'Jadikan Online'
  const statusLabel = myVendorRow && myVendorRow.online ? 'Online' : 'Offline'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari pedagang..." className="border p-2 rounded w-full md:w-80" />
            <button onClick={() => { setQuery(''); loadVendors() }} className="px-3 py-2 bg-gray-100 rounded">Reset</button>
            <button onClick={() => clusterRef.current && mapRef.current && mapRef.current.fitBounds(clusterRef.current.getBounds(), { padding:[60,60] }) } className="px-3 py-2 bg-blue-600 text-white rounded">Zoom Semua</button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm">Radius (km)</label>
            <input type="number" step="0.1" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value || 0))} className="border p-2 rounded w-24" />
            <label className="flex items-center gap-2 ml-2">
              <input type="checkbox" checked={onlyWithinRadius} onChange={(e) => setOnlyWithinRadius(e.target.checked)} />
              <span className="text-sm">Tampilkan dalam radius</span>
            </label>
            <label className="flex items-center gap-2 ml-2">
              <input type="checkbox" checked={clusterEnabled} onChange={(e) => setClusterEnabled(e.target.checked)} />
              <span className="text-sm">Cluster</span>
            </label>
            <button onClick={() => mapRef.current && mapRef.current.locate({ setView: true, maxZoom: 16 }) } className="px-3 py-2 border rounded">Lokasi Saya</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          <div>
            <div ref={containerRef} style={{ height: '72vh', borderRadius: 8 }} className="shadow" />
            <div className="text-xs text-gray-500 mt-2 flex gap-2 items-center">
              <div>{loading ? 'Memuat...' : `${vendors.length} pedagang`}</div>
              {onlyWithinRadius && userLocation && <div className="text-sm text-gray-600">({vendorsWithinRadius.length} dalam {radiusKm} km)</div>}
            </div>
          </div>

          <aside className="space-y-4">
            {!selectedVendor ? (
              <div className="bg-white p-3 rounded shadow">
                <div className="font-semibold">Detail Pedagang</div>
                <div className="text-sm text-gray-500 mt-2">Klik marker untuk melihat profil pedagang, produk, chat, atau memesan.</div>
                <div className="mt-3">
                  <button onClick={() => loadVendors()} className="px-3 py-2 border rounded text-sm">Refresh Pedagang</button>
                </div>

                {isVendor && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Kontrol Pedagang</div>
                    <div className="flex gap-2">
                      <button onClick={toggleMyOnlineOptimistic} className="px-3 py-2 bg-green-600 text-white rounded">
                        { myVendorRow?.__updating ? 'Menyimpan...' : toggleLabel }
                      </button>
                      <button onClick={goToManageProducts} className="px-3 py-2 border rounded">Kelola Produk</button>
                    </div>
                    <div className="mt-2 text-sm">Status saat ini: <strong>{statusLabel}</strong></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-3 rounded shadow space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded overflow-hidden bg-gray-100">
                    {selectedVendor.photo_url ? <img src={selectedVendor.photo_url} alt="p" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xl">{(selectedVendor.name||'P')[0]}</div>}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedVendor.name}</div>
                    <div className="text-xs text-gray-500">{selectedVendor.online ? 'Online' : 'Offline'}</div>
                  </div>
                </div>

                <div className="text-sm text-gray-700">{selectedVendor.description || '-'}</div>

                {isVendor && myVendorId === selectedVendor.id ? (
                  <div className="flex gap-2">
                    <button onClick={toggleMyOnlineOptimistic} className="px-3 py-2 bg-green-600 text-white rounded">{ toggleLabel }</button>
                    <button onClick={goToManageProducts} className="px-3 py-2 border rounded">Kelola Produk</button>
                    <button onClick={() => window.location.href = `/vendor/${selectedVendor.id}`} className="px-3 py-2 border rounded">Edit Profil</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => window.location.href = `/chat/${selectedVendor.id}`} className="px-3 py-2 border rounded">Chat</button>
                    <button onClick={() => window.location.href = `/vendor/${selectedVendor.id}`} className="px-3 py-2 border rounded">Lihat Profil</button>
                    <button onClick={() => window.location.href = `/vendor/${selectedVendor.id}#order`} className="px-3 py-2 bg-green-600 text-white rounded">Buat Pesanan</button>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-sm mt-2">Produk (Preview)</h4>
                  <VendorProductsPreview vendorId={selectedVendor.id} />
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
