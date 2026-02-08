import React from 'react'

export default function OrdersPanel({ orders = [] }){
  return (
    <div className="bg-white p-3 rounded shadow mt-3">
      <h4 className="font-semibold">Riwayat Pesanan ({orders.length})</h4>
      <div className="mt-2 space-y-2">
        {orders.map(o => (
          <div key={o.id} className="p-2 border rounded">
            <div className="font-semibold">{o.vendor_name || o.buyer_name}</div>
            <div className="text-sm text-gray-600">{o.items}</div>
            <div className="text-xs text-gray-500">Status: {o.status}</div>
          </div>
        ))}
        {orders.length === 0 && <div className="text-sm text-gray-500">Belum ada pesanan</div>}
      </div>
    </div>
  )
}
