// src/lib/auth.jsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext()
export function AuthProvider({ children }){
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let mounted = true
    async function init(){
      try {
        const r = await supabase.auth.getSession()
        const u = r?.data?.session?.user ?? null
        if (mounted) setUser(u)
        if (u) await determineRole(u.id)
      } catch(e){
        console.error('auth.init err', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('onAuthStateChange', event, session)
      const u = session?.user ?? null
      setUser(u)
      if (u) determineRole(u.id)
      else setRole(null)
      setLoading(false)
    })

    async function determineRole(uid){
      try {
        const { data } = await supabase.from('vendors').select('id').eq('id', uid).maybeSingle()
        setRole(data?.id ? 'vendor' : 'customer')
      } catch(e){
        console.error('determineRole', e)
        setRole('customer')
      }
    }

    return ()=> {
      mounted = false
      try { listener.subscription.unsubscribe() } catch {}
    }
  }, [])

  return <AuthContext.Provider value={{ user, role, loading }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
