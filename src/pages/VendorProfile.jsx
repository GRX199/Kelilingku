import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function VendorProfile(){
  const { id } = useParams()
  const [vendor, setVendor] = useState(null)
  const [products, setProducts] = useState([])

  useEffect(()=>{
    (async ()=> {
      const { data } = await supabase.from('vendors').select('*').eq('id', id).maybeSingle()
      setVendor(data)
      const { data: ps } = await supabase.from('products').select('*').eq('vendor_id', id).order('created_at', { ascending: false })
      setProducts(ps || [])
    })()
  },[id])

  if(!vendor) return <div className="p-6">Pedagang tidak ditemukan</div>
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 bg-white p-4 rounded shadow">
          <div className="flex flex-col items-center">
            <img src={vendor.photo_url||`https://ui-avatars.com/api/?name=${encodeURIComponent(vendor.name)}`} className="w-36 h-36 rounded-full object-cover" alt="profile" />
            <h2 className="mt-3 text-lg font-semibold">{vendor.name}</h2>
            <div className="text-sm text-gray-600 mt-1">{vendor.description || 'Pedagang lokal'}</div>
          </div>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold">Produk</h3>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              {products.map(p => (
                <div key={p.id} className="p-3 border rounded flex items-start gap-3">
                  <img src={p.image_url||`https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`} className="w-16 h-16 object-cover rounded" />
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.price ? `Rp ${p.price}` : '-'}</div>
                  </div>
                </div>
              ))}
              {products.length === 0 && <div className="text-sm text-gray-500">Belum ada produk</div>}
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold">Lokasi & Info</h3>
            <div className="mt-2 text-sm text-gray-600">{vendor.location ? `${vendor.location.latitude}, ${vendor.location.longitude}` : 'Lokasi belum dibagikan'}</div>
            <div className="mt-2 text-sm">Status: {vendor.online ? <span className="text-green-600">Online</span> : <span className="text-gray-500">Offline</span>}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
