import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
    }
  }

  return (
    <div style={{ minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1e2f' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', color: '#4da6ff', fontSize: '26px', margin: '0 0 5px 0', letterSpacing: '1px' }}>JARVIS</h1>
        <p style={{ textAlign: 'center', color: '#718096', fontSize: '13px', margin: '0 0 30px 0' }}>Panel pracownika</p>

        {status === 'sent' ? (
          <div style={{ textAlign: 'center', color: '#2f855a', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '8px', padding: '15px', fontSize: '14px' }}>
            ✅ Link logowania wysłany na <strong>{email}</strong>.<br />Sprawdź skrzynkę pocztową.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Adres e-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ty@firma.pl" />
            </div>
            {status === 'error' && (
              <div style={{ color: '#e53e3e', fontSize: '13px', marginBottom: '10px' }}>{errorMsg}</div>
            )}
            <button type="submit" className="btn-primary" disabled={status === 'sending'} style={{ width: '100%' }}>
              {status === 'sending' ? 'Wysyłanie...' : 'Wyślij link logowania'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
