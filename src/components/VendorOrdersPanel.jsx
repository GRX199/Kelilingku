import React from 'react'

export default function VendorOrdersPanel({ orders = [], onUpdateStatus = () => {} }){
  return (
    <div className="bg-white p-3 rounded shadow mt-3">
      <h4 className="font-semibold">Pesanan Masuk ({orders.length})</h4>
      <div className="mt-2 space-y-2">
        {orders.map(o => (
          <div key={o.id} className="p-2 border rounded">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{o.buyer_name}</div>
                <div className="text-sm text-gray-600">{o.items}</div>
                <div className="text-xs text-gray-500 mt-1">Status: {o.status}</div>
              </div>
              <div className="flex flex-col gap-2">
                {o.status === 'pending' && (
                  <>
                    <button onClick={() => onUpdateStatus(o.id, 'accepted')} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Terima</button>
                    <button onClick={() => onUpdateStatus(o.id, 'rejected')} className="px-2 py-1 border rounded text-sm">Tolak</button>
                  </>
                )}
                {o.status !== 'pending' && <div className="text-xs text-gray-500">Updated</div>}
              </div>
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="text-sm text-gray-500">Belum ada pesanan</div>}
      </div>
    </div>
  )
}
