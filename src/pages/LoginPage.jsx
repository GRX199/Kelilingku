// src/pages/LoginPage.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastProvider'

export default function LoginPage(){
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('customer')
  const [loading, setLoading] = useState(false)
  const [inlineMsg, setInlineMsg] = useState(null)
  const toast = useToast()
  const nav = useNavigate()

  async function handleSubmit(e){
    e.preventDefault()
    setInlineMsg(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } }
        })
        if (error) {
          console.error('signUp error', error)
          toast.push(error.message || 'Gagal daftar', { type: 'error' })
          setInlineMsg(error.message)
          setLoading(false)
          return
        }
        // create vendor row only if supabase returned user id immediately
        const uid = data?.user?.id
        if (role === 'vendor' && uid) {
          try {
            await supabase.from('vendors').insert([{ id: uid, user_id: uid, name: name || 'Pedagang' }])
          } catch (e) {
            console.warn('create vendor row failed', e)
          }
        }
        toast.push('Daftar berhasil. Cek email untuk verifikasi jika aktif pada project Anda.', { type: 'success' })
        setMode('login')
      } else {
        // login
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        console.log('signInWithPassword ->', { data, error })
        if (error) {
          // show friendly message
          toast.push(error.message || 'Gagal login', { type: 'error' })
          setInlineMsg(error.message || 'Gagal login')
          setLoading(false)
          return
        }

        // if no session (data.session == null) it's usually because email confirmation is required
        if (!data?.session) {
          const warn = 'Login berhasil tetapi sesi belum dibuat. Coba verifikasi email Anda lalu login kembali.'
          toast.push(warn, { type: 'error' })
          setInlineMsg(warn)
          setLoading(false)
          return
        }

        // success
        toast.push('Login berhasil', { type: 'success' })
        nav('/dashboard')
      }
    } catch (err) {
      console.error('Auth unexpected error', err)
      toast.push(String(err.message || err), { type: 'error' })
      setInlineMsg(String(err.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification(){
    // Supabase client SDK doesn't provide a direct "resend verification" endpoint.
    // Options:
    // 1) Ask student/admin to resend from Supabase Dashboard -> Auth -> Users -> (resend)
    // 2) Implement server-side endpoint (using service_role key) to trigger resend.
    // Here we simply inform the user.
    toast.push('Untuk kirim ulang verifikasi: buka Supabase Dashboard → Auth → Users → pilih user → Resend confirmation (atau hubungi admin).', { type: 'info', timeout: 8000 })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white p-8 rounded shadow">
        <h1 className="text-2xl font-bold mb-2">Pedagang Keliling</h1>

        <div className="mt-4">
          <button onClick={()=>setMode('login')} className={`mr-2 px-4 py-2 rounded ${mode==='login'?'bg-blue-600 text-white':'bg-gray-100'}`}>Masuk</button>
          <button onClick={()=>setMode('register')} className={`${mode==='register'?'bg-blue-600 text-white':'bg-gray-100'} px-4 py-2 rounded`}>Daftar</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          {mode==='register' && <input className="w-full p-3 border rounded mb-3" placeholder="Nama" value={name} onChange={e=>setName(e.target.value)} />}
          <input className="w-full p-3 border rounded mb-3" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="w-full p-3 border rounded mb-3" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {mode==='register' && (
            <select className="w-full p-3 border rounded mb-3" value={role} onChange={e=>setRole(e.target.value)}>
              <option value="customer">Pelanggan</option>
              <option value="vendor">Pedagang</option>
            </select>
          )}

          {inlineMsg && <div className="mb-3 text-sm text-red-600">{inlineMsg}</div>}

          <div className="flex gap-2">
            <button disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
              {loading ? 'Sedang...' : (mode==='login' ? 'Masuk' : 'Daftar')}
            </button>

            <button type="button" onClick={()=>setMode(mode==='login'?'register':'login')} className="px-4 py-2 border rounded">
              {mode==='login' ? 'Beralih ke Daftar' : 'Beralih ke Masuk'}
            </button>

            {mode==='login' && (
              <button type="button" onClick={handleResendVerification} className="ml-auto px-3 py-1 text-sm text-gray-600 underline">
                Kirim ulang verifikasi
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
