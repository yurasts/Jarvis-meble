import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import s from './Login.module.css';

// Powtórna wysyłka kodu — dopiero po odczekaniu tylu sekund. Cooldown jest wspólny dla obu
// kroków (jeden stan resendCooldown używany i na kroku 'email', i na kroku 'code') — inaczej
// "Zmień e-mail" + ponowne "Wyślij kod logowania" pozwoliłoby ominąć limit i od razu wywołać
// email rate limit exceeded po stronie Supabase.
const RESEND_COOLDOWN_SECONDS = 60;

// Błąd sieci (fetch rzucił wyjątek, zanim Supabase w ogóle odpowiedziało) — osobny komunikat,
// bo mapAuthError() oczekuje obiektu error z odpowiedzi API, którego tu nie ma.
const NETWORK_ERROR_MESSAGE = 'Błąd połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';

// Supabase auth-js (AuthApiError) zwraca ustrukturyzowany error.code — używamy go jako
// podstawowego sygnału (dokumentowane wartości, np. 'otp_expired'), z fallbackiem na
// dopasowanie tekstu wiadomości na wypadek błędów sieciowych/innych bez pola code. Wydzielona
// osobno (nie tylko wewnątrz mapAuthError), bo sendCode musi też na jej podstawie uruchomić
// resendCooldown — bez analizowania gotowego polskiego tekstu komunikatu.
function isRateLimitError(error) {
  const code = error?.code || '';
  const msg = (error?.message || '').toLowerCase();
  return (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    error?.status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many')
  );
}

function mapAuthError(error, { context }) {
  if (!error) return '';
  if (isRateLimitError(error)) {
    return 'Zbyt wiele prób logowania. Odczekaj chwilę i spróbuj ponownie.';
  }
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  if (context === 'verify') {
    const isExpired = code === 'otp_expired' || msg.includes('expired');
    if (isExpired) return 'Kod wygasł. Poproś o nowy kod logowania.';
    return 'Nieprawidłowy kod logowania. Sprawdź kod i spróbuj ponownie.';
  }
  return 'Nie udało się wysłać kodu logowania. Sprawdź adres e-mail i spróbuj ponownie.';
}

export default function Login() {
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // Ochrona przed podwójnym wysłaniem przy szybkim podwójnym kliknięciu/tapnięciu — synchroniczna
  // flaga w ref sprawdzana PRZED pierwszym await; samego React state by nie wystarczyło (jego
  // aktualizacja jest asynchroniczna i nie zdąży zablokować drugiego kliknięcia w tym samym ticku).
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(v => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const sendCode = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSending(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        // Rate limit z Supabase — mimo że wysyłka się nie powiodła, trzeba i tak uruchomić
        // cooldown, inaczej przycisk zostaje od razu aktywny i użytkownik może dalej bić
        // w rate limit (który sam w sobie nie ustawia żadnego czasu oczekiwania po stronie klienta).
        if (isRateLimitError(error)) {
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        }
        setErrorMsg(mapAuthError(error, { context: 'send' }));
        return;
      }
      setStep('code');
      setCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      // Wyjątek sieciowy (np. fetch failed) — bez tego catch inFlightRef zostałby ustawiony
      // na true na zawsze, blokując wszystkie kolejne próby aż do przeładowania strony.
      setErrorMsg(NETWORK_ERROR_MESSAGE);
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }, [email]);

  const handleSendCode = (e) => {
    e.preventDefault();
    if (resendCooldown > 0) return;
    sendCode();
  };

  const handleResend = () => {
    if (resendCooldown > 0 || sending) return;
    sendCode();
  };

  const handleChangeEmail = () => {
    setStep('email');
    setCode('');
    setErrorMsg('');
    // resendCooldown celowo NIE jest resetowany — inaczej "Zmień e-mail" + natychmiastowe
    // ponowne "Wyślij kod logowania" pozwoliłoby ominąć 60-sekundowy limit.
  };

  async function handleVerify(e) {
    e.preventDefault();
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setVerifying(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (error) {
        setErrorMsg(mapAuthError(error, { context: 'verify' }));
        return;
      }
      // Sukces: AuthContext już nasłuchuje supabase.auth.onAuthStateChange i sam podejmie
      // nową sesję — App.jsx przerysuje się poza Login bez przeładowania strony.
    } catch {
      setErrorMsg(NETWORK_ERROR_MESSAGE);
    } finally {
      inFlightRef.current = false;
      setVerifying(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <h1 className={s.logo}>JARVIS</h1>
        <p className={s.subtitle}>Panel pracownika</p>

        {step === 'email' ? (
          <form onSubmit={handleSendCode}>
            <div className="form-group">
              <label>Adres e-mail</label>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ty@firma.pl"
              />
            </div>
            {errorMsg && <div className={s.errorMsg}>{errorMsg}</div>}
            <button
              type="submit"
              className={`btn-primary ${s.submitBtn}`}
              disabled={sending || resendCooldown > 0}
            >
              {sending
                ? 'Wysyłanie...'
                : resendCooldown > 0
                  ? `Wyślij kod ponownie (${resendCooldown}s)`
                  : 'Wyślij kod logowania'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className={s.emailRow}>
              <span className={s.emailValue} title={email}>{email}</span>
              <button type="button" className={s.changeEmailBtn} onClick={handleChangeEmail}>
                Zmień e-mail
              </button>
            </div>
            <div className="form-group">
              <label>Kod z wiadomości</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className={s.codeInput}
              />
            </div>
            {errorMsg && <div className={s.errorMsg}>{errorMsg}</div>}
            <button
              type="submit"
              className={`btn-primary ${s.submitBtn}`}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? 'Logowanie...' : 'Zaloguj'}
            </button>
            <button
              type="button"
              className={s.resendBtn}
              onClick={handleResend}
              disabled={resendCooldown > 0 || sending}
            >
              {resendCooldown > 0
                ? `Wyślij kod ponownie (${resendCooldown}s)`
                : (sending ? 'Wysyłanie...' : 'Wyślij kod ponownie')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
