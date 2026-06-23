import { useState } from 'react';
import { supabase } from '../supabase';
import s from './Login.module.css';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [status,   setStatus]   = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <h1 className={s.logo}>JARVIS</h1>
        <p className={s.subtitle}>Panel pracownika</p>

        {status === 'sent' ? (
          <div className={s.successBox}>
            ✅ Link logowania wysłany na <strong>{email}</strong>.<br />
            Sprawdź skrzynkę pocztową.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Adres e-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ty@firma.pl"
              />
            </div>
            {status === 'error' && (
              <div className={s.errorMsg}>{errorMsg}</div>
            )}
            <button
              type="submit"
              className={`btn-primary ${s.submitBtn}`}
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'Wysyłanie...' : 'Wyślij link logowania'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
