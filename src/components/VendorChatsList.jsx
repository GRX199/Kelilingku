// src/components/VendorChatsList.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from './ToastProvider'

export default function VendorChatsList({ onOpenChat = () => {} }) {
  const { user } = useAuth()
  const toast = useToast()
  const [chats, setChats] = useState([])

  useEffect(() => {
    if (!user) return
    let mounted = true

    const fetchChats = async () => {
      try {
        // use contains to find rows where participants array contains user.id
        const { data, error } = await supabase.from('chats').select('*').contains('participants', [user.id])
        if (error) throw error
        if (mounted) setChats(data || [])
      } catch (e) {
        console.error('fetchChats', e)
        toast.push('Gagal memuat chat: ' + (e.message || e), { type: 'error' })
      }
    }

    fetchChats()

    const channel = supabase
      .channel('chats-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchChats()
      })
      .subscribe()

    return () => {
      mounted = false
      try {
        supabase.removeChannel(channel)
      } catch (e) {}
    }
  }, [user, toast])

  return (
    <div className="bg-white p-3 rounded shadow mt-3">
      <h4 className="font-semibold">Chat ({chats.length})</h4>
      <div className="mt-2 space-y-2">
        {chats.map((c) => {
          const partner = (c.participants || []).find((p) => p !== (user && user.id))
          return (
            <div key={c.id} className="p-2 border rounded flex justify-between items-center">
              <div>
                <div className="font-semibold">Chat: {partner ?? c.id}</div>
                <div className="text-xs text-gray-500">{c.last_updated}</div>
              </div>
              <div>
                <button onClick={() => onOpenChat({ id: c.id, name: partner ?? 'User' })} className="px-2 py-1 border rounded">
                  Buka
                </button>
              </div>
            </div>
          )
        })}
        {chats.length === 0 && <div className="text-sm text-gray-500">Belum ada chat</div>}
      </div>
    </div>
  )
}
