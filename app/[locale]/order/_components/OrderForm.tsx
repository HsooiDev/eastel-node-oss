'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { t } from '@/lib/i18n'
import { TurnstileWidget } from '@/components/turnstile-widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OrderPlanSelector, ORDER_PLAN_COPY } from '@/components/orders/order-plan-selector'
import { availablePlan, validateCatalogue, type Catalogue } from '@/public/recommender/engine.mjs'
import type { StorefrontCheckout } from '@/lib/storefront'

type CourierRow = StorefrontCheckout['couriers'][number]

interface OrderFormProps {
  locale: string
  tr: Record<string, string>
}

interface AiCheckoutDetails {
  full_name: string
  email: string
  phone: string
  alt_phone?: string
  address_line1: string
  address_line2?: string
  postcode: string
  city: string
  state: string
}

interface InitialCheckoutData {
  session: { status: string; customer?: { email: string }; emailVerified?: boolean } | null
  draft: { status: string; details?: AiCheckoutDetails } | null
}

const CHECKOUT_COPY = {
  en: {
    loading: 'Loading checkout information…',
    unavailable: 'Checkout information is temporarily unavailable. Please try again.',
    outOfStock: 'This SIM card is currently out of stock.',
    shippingUnavailable: 'Delivery is currently unavailable. Please try again or contact us.',
    retry: 'Try again',
    aiApplied: 'Your AI assistant filled in your details. Review them, verify your email, and complete the security check before paying.',
    aiAccountEmail: 'Your AI assistant filled in your delivery details. Checkout uses your signed-in account email. Review the details and complete the security check before paying.',
    aiInvalid: 'This checkout link has expired or is invalid. You can fill in the form below or ask your AI assistant for a new link.',
  },
  ms: {
    loading: 'Memuatkan maklumat pesanan…',
    unavailable: 'Maklumat pesanan tidak tersedia buat sementara waktu. Sila cuba lagi.',
    outOfStock: 'Kad SIM ini kehabisan stok buat masa ini.',
    shippingUnavailable: 'Penghantaran tidak tersedia buat masa ini. Sila cuba lagi atau hubungi kami.',
    retry: 'Cuba lagi',
    aiApplied: 'Pembantu AI anda telah mengisi maklumat anda. Semak maklumat, sahkan e-mel dan lengkapkan semakan keselamatan sebelum membayar.',
    aiAccountEmail: 'Pembantu AI anda telah mengisi maklumat penghantaran. Pesanan menggunakan e-mel akaun yang dilog masuk. Semak maklumat dan lengkapkan semakan keselamatan sebelum membayar.',
    aiInvalid: 'Pautan pesanan ini telah tamat tempoh atau tidak sah. Isi borang di bawah atau minta pautan baharu daripada pembantu AI anda.',
  },
  zh: {
    loading: '正在加载订单信息…',
    unavailable: '暂时无法获取订单信息，请重试。',
    outOfStock: '此 SIM 卡暂时缺货。',
    shippingUnavailable: '暂时无法安排配送，请重试或联系我们。',
    retry: '重试',
    aiApplied: 'AI 已帮您填写资料。请检查资料、验证邮箱并完成安全检查，再确认付款。',
    aiAccountEmail: 'AI 已帮您填写配送资料。订单将使用您当前登录账号的邮箱，请检查资料并完成安全检查，再确认付款。',
    aiInvalid: '此结账链接已过期或无效。您可以在下方手动填写，或请 AI 生成新链接。',
  },
}

const FORM_SS_KEY = 'eastel-order-form'

function readSaved(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = sessionStorage.getItem(FORM_SS_KEY)
    if (!raw) return ''
    const d = JSON.parse(raw) as Record<string, string>
    return d[key] ?? ''
  } catch { return '' }
}

const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan',
  'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak',
  'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya',
]

function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, '').replace(/^(\+60|60|0)/, '')
  return /^\d{7,11}$/.test(s) ? `+60${s}` : null
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function zoneBadge(zone: 'WM' | 'EM' | 'Labuan', tr: Record<string, string>): string {
  if (zone === 'WM') return `🟢 ${t(tr, 'ordZoneWest', 'West Malaysia')}`
  if (zone === 'EM') return `🔵 ${t(tr, 'ordZoneEast', 'East Malaysia')}`
  return `🟠 Labuan`
}

export default function OrderForm({ locale, tr }: OrderFormProps) {
  const router = useRouter()
  const __ = (key: string, fallback?: string) => t(tr, key, fallback ?? key)
  const checkoutCopy = CHECKOUT_COPY[locale as keyof typeof CHECKOUT_COPY] ?? CHECKOUT_COPY.en
  const planCopy = ORDER_PLAN_COPY[locale as keyof typeof ORDER_PLAN_COPY] ?? ORDER_PLAN_COPY.en

  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [aiCheckoutNotice, setAiCheckoutNotice] = useState<'applied' | 'account' | 'invalid' | null>(null)
  const initialCheckoutRequest = useRef<Promise<InitialCheckoutData> | null>(null)
  const [fullName, setFullName] = useState(() => readSaved('fullName'))
  const [email, setEmail] = useState(() => readSaved('email'))
  const [phone, setPhone] = useState(() => readSaved('phone'))
  const [altPhone, setAltPhone] = useState(() => readSaved('altPhone'))
  const [address1, setAddress1] = useState(() => readSaved('address1'))
  const [address2, setAddress2] = useState(() => readSaved('address2'))
  const [postcode, setPostcode] = useState(() => readSaved('postcode'))
  const [city, setCity] = useState(() => readSaved('city'))
  const [stateName, setStateName] = useState(() => readSaved('stateName'))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [emailVerified, setEmailVerified] = useState(false)
  const [emailVerifyToken, setEmailVerifyToken] = useState('')
  const [lastVerifiedEmail, setLastVerifiedEmail] = useState('')
  const [guestOverride, setGuestOverride] = useState(false)
  const [showVerifyBtn, setShowVerifyBtn] = useState(false)
  const [showVerifyRow, setShowVerifyRow] = useState(false)
  const [showRegisteredRow, setShowRegisteredRow] = useState(false)
  const [otpToken, setOtpToken] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [otpError, setOtpError] = useState('')

  const [zone, setZone] = useState<'WM' | 'EM' | 'Labuan' | null>(null)
  const [zoneLoading, setZoneLoading] = useState(false)
  const zoneRequestId = useRef(0)
  const [product, setProduct] = useState<StorefrontCheckout['product']>(null)
  const [couriers, setCouriers] = useState<CourierRow[]>([])
  const [storefrontLoading, setStorefrontLoading] = useState(true)
  const [storefrontFailed, setStorefrontFailed] = useState(false)
  const [storefrontReload, setStorefrontReload] = useState(0)
  const [selectedCourier, setSelectedCourier] = useState<{ id: number; name: string; fee: number } | null>(null)
  const zoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionId         = useRef<string>(crypto.randomUUID())
  const inquiryId         = useRef<number | null>(null)
  const emailCheckTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [postcodeAttempted, setPostcodeAttempted] = useState<boolean>(false)

  // TurnstileWidget uses onToken — empty string means expired/error
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showEmailRegisteredError, setShowEmailRegisteredError] = useState(false)
  const [dnqrAvailable, setDnqrAvailable] = useState(false)
  const [checkingDnqr, setCheckingDnqr] = useState(true)

  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; discount: number } | null>(null)
  const [voucherError, setVoucherError] = useState('')
  const [validatingVoucher, setValidatingVoucher] = useState(false)

  const [purchaseMode, setPurchaseMode] = useState<'sim_only' | 'sim_and_plan'>('sim_only')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [planSelectionInitialized, setPlanSelectionInitialized] = useState(false)
  const [planCatalogue, setPlanCatalogue] = useState<Catalogue | null>(null)
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansFailed, setPlansFailed] = useState(false)
  const [planReload, setPlanReload] = useState(0)

  const selectedPlan = availablePlan(planCatalogue, selectedPlanId)
  const purchasedPlan = purchaseMode === 'sim_and_plan' ? selectedPlan : null
  const planFee = purchasedPlan?.price ?? 0
  const planReady = planSelectionInitialized && (purchaseMode === 'sim_only' || (!plansLoading && !plansFailed && purchasedPlan !== null))
  const planError = plansLoading ? planCopy.loading : plansFailed ? planCopy.catalogueUnavailable : planCopy.chooseBeforePay
  const checkoutReturnPath = `/${locale}/order?purchase=${purchaseMode}${selectedPlanId ? `&plan=${encodeURIComponent(selectedPlanId)}` : ''}`

  const deliveryFee = selectedCourier?.fee ?? 0
  const simFee = product?.price ?? 0
  const shippingReady = !initializing && !storefrontLoading && !zoneLoading && product?.available === true && zone !== null && selectedCourier !== null
  const checkoutReady = shippingReady && planReady

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // A recommendation alone does not authorize an extra plan charge.
    setPurchaseMode(params.get('purchase') === 'sim_and_plan' ? 'sim_and_plan' : 'sim_only')
    setSelectedPlanId((params.get('plan') ?? '').trim().toLowerCase())
    setPlanSelectionInitialized(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    setPlansLoading(true)
    setPlansFailed(false)
    setPlanCatalogue(null)
    void (async () => {
      try {
        const res = await fetch('/api/plan-recommender', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        const data = await res.json() as { status: string; catalogue?: unknown }
        if (!res.ok || data.status !== 'success' || !validateCatalogue(data.catalogue)) throw new Error('Plan catalogue unavailable')
        if (!cancelled) setPlanCatalogue(data.catalogue)
      } catch {
        if (!cancelled) setPlansFailed(true)
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [planReload])

  useEffect(() => {
    let cancelled = false
    setStorefrontLoading(true)
    setStorefrontFailed(false)
    setProduct(null)
    setCouriers([])
    setSelectedCourier(null)
    void (async () => {
      try {
        const res = await fetch('/api/storefront/checkout', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        const data = await res.json() as StorefrontCheckout & { status: string }
        if (!res.ok || data.status !== 'success' || !Array.isArray(data.couriers)) {
          throw new Error('Checkout information unavailable')
        }
        if (!cancelled) {
          setProduct(data.product)
          setCouriers(data.couriers)
        }
      } catch {
        if (!cancelled) setStorefrontFailed(true)
      } finally {
        if (!cancelled) setStorefrontLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [storefrontReload])

  useEffect(() => {
    if (!zone || storefrontLoading) { setSelectedCourier(null); return }
    const feeKey = zone === 'WM' ? 'wm_fee' : zone === 'EM' ? 'em_fee' : 'labuan_fee'
    const cheapest = [...couriers].sort((a, b) => Number(a[feeKey]) - Number(b[feeKey]) || a.id - b.id)[0]
    setSelectedCourier(cheapest ? { id: cheapest.id, name: cheapest.name, fee: Number(cheapest[feeKey]) } : null)
  }, [zone, couriers, storefrontLoading])

  useEffect(() => {
    if (appliedVoucher && shippingReady) {
      const subtotal = simFee + deliveryFee;
      if (subtotal > 0) {
        void (async () => {
          try {
            const res = await fetch('/api/vouchers?action=validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: appliedVoucher.code, subtotal }),
            });
            const data = await res.json();
            if (data.status === 'success') {
              setAppliedVoucher({ code: appliedVoucher.code, discount: parseFloat(data.discount) });
              setVoucherError('');
            } else {
              setAppliedVoucher(null);
              setVoucherError(data.message || 'Voucher is no longer valid for this subtotal.');
            }
          } catch {
            setAppliedVoucher(null);
          }
        })();
      }
    }
  }, [deliveryFee, simFee, shippingReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyVoucher = async () => {
    const code = voucherCode.trim();
    if (!code) return;
    if (!shippingReady) { setVoucherError(checkoutCopy.shippingUnavailable); return; }
    setValidatingVoucher(true);
    setVoucherError('');
    try {
      const subtotal = simFee + deliveryFee;
      if (subtotal <= 0) {
        setVoucherError('Add your postcode first to see the total.');
        setValidatingVoucher(false);
        return;
      }
      const res = await fetch('/api/vouchers?action=validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAppliedVoucher({ code, discount: parseFloat(data.discount) });
        setVoucherCode('');
      } else {
        setVoucherError(data.message || 'Invalid voucher code.');
      }
    } catch {
      setVoucherError('Error validating voucher.');
    }
    setValidatingVoucher(false);
  };

  const discount = appliedVoucher ? appliedVoucher.discount : 0
  const total = simFee + deliveryFee + planFee - discount

  // Dynamic button label — tells customer exactly what to do next
  const buttonLabel = (checkingDnqr || isSubmitting)
    ? __('ordProcessingBtn')
    : initializing || storefrontLoading || zoneLoading
    ? checkoutCopy.loading
    : !product
    ? checkoutCopy.unavailable
    : !product.available
    ? checkoutCopy.outOfStock
    : !planReady
    ? planError
    : !emailVerified
    ? __('ordBtnVerifyEmail', 'Verify Email to Continue →')
    : !zone
    ? __('ordBtnEnterPostcode', 'Enter Postcode to Continue →')
    : !selectedCourier
    ? checkoutCopy.shippingUnavailable
    : !turnstileToken
    ? __('ordBtnCaptcha', 'Complete Security Check →')
    : __('ordPayBtn')

  function scrollToField(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => el.focus(), 300)
  }

  function scrollToFirstError(errorMap: Record<string, string>) {
    const order = ['fullName', 'email', 'phone', 'altPhone', 'address1', 'postcode', 'city', 'stateName']
    const first = order.find(f => errorMap[f])
    if (first) scrollToField(first)
  }

  function handlePayClick(method: 'fpx' | 'dnqr' = 'fpx') {
    if (checkingDnqr || isSubmitting) return
    if (initializing || storefrontLoading || zoneLoading) return
    if (!product?.available) { setSubmitError(product ? checkoutCopy.outOfStock : checkoutCopy.unavailable); return }
    if (!planReady) { setSubmitError(planError); document.getElementById('order-plan-choice')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (!emailVerified) { scrollToField('email'); return }
    if (!zone) { scrollToField('postcode'); setErrors(prev => ({ ...prev, postcode: __('ordErrPostReq') })); return }
    if (!selectedCourier) { setSubmitError(checkoutCopy.shippingUnavailable); return }
    if (!turnstileToken) { document.getElementById('turnstile-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    const fieldErrors = validateAll()
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); scrollToFirstError(fieldErrors); return }
    void handleSubmit(method)
  }

  useEffect(() => {
    let cancelled = false
    // Keep one request across Strict Mode's effect replay. Remove the encrypted
    // bearer fragment before starting any requests; never persist or log it.
    if (!initialCheckoutRequest.current) {
      const hash = window.location.hash
      const hasDraft = hash.startsWith('#ai_checkout=')
      let token = ''
      if (hasDraft) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
        try { token = decodeURIComponent(hash.slice('#ai_checkout='.length)) } catch { /* invalid fragment */ }
      }
      const sessionRequest = fetch('/api/auth/check', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
      const draftRequest = hasDraft
        ? token
          ? fetch('/api/ai/checkout-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify({ token }),
          }).then(r => r.ok ? r.json() : { status: 'error' }).catch(() => ({ status: 'error' }))
          : Promise.resolve({ status: 'error' })
        : Promise.resolve(null)
      initialCheckoutRequest.current = Promise.all([sessionRequest, draftRequest])
        .then(([session, draft]) => ({ session, draft }))
    }
    void initialCheckoutRequest.current.then(({ session, draft }) => {
      if (cancelled) return
      const accountEmail = session?.status === 'success' && session.customer?.email && isValidEmail(session.customer.email)
        ? session.customer.email : null
      const details = draft?.status === 'success' ? draft.details : null
      if (details) {
        resetEmailVerification()
        setTurnstileToken('')
        setTurnstileKey(value => value + 1)
        setFullName(details.full_name)
        // The inputs already display +60; keep only the local number in state.
        setPhone(details.phone.replace(/^(\+?60|0)/, ''))
        setAltPhone((details.alt_phone ?? '').replace(/^(\+?60|0)/, ''))
        setAddress1(details.address_line1)
        setAddress2(details.address_line2 ?? '')
        setPostcode(details.postcode)
        setCity(details.city)
        setStateName(details.state)
        setAiCheckoutNotice(accountEmail ? 'account' : 'applied')
        if (!accountEmail) {
          setEmail(details.email)
          // The private handoff stays in POST bodies. Let the customer verify
          // the draft email without adding it to an automatic lookup URL.
          setShowVerifyBtn(true)
        }
        void detectZone(details.postcode)
      } else {
        if (draft) setAiCheckoutNotice('invalid')
        if (postcode && /^\d{5}$/.test(postcode)) void detectZone(postcode)
        if (!accountEmail && email && isValidEmail(email)) void handleEmailBlur(email)
      }
      if (accountEmail) {
        setIsLoggedIn(true)
        setEmail(accountEmail)
        setLastVerifiedEmail(accountEmail)
        setEmailVerified(session?.emailVerified === true)
        setShowVerifyBtn(session?.emailVerified !== true)
      }
      setInitializing(false)
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/payment/check-dnqr')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'success' && d.available) setDnqrAvailable(true)
      })
      .catch(() => {})
      .finally(() => setCheckingDnqr(false))
  }, [])

  useEffect(() => {
    const handler = () => { if (!document.hidden && isSubmitting) setIsSubmitting(false) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [isSubmitting])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const id = setTimeout(() => setResendCountdown(n => n - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCountdown])

  // Persist form fields to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_SS_KEY, JSON.stringify({
        fullName, email, phone, altPhone, address1, address2, postcode, city, stateName,
      }))
    } catch { /* ignore */ }
  }, [fullName, email, phone, altPhone, address1, address2, postcode, city, stateName])

  function resetEmailVerification() {
    setEmailVerified(false)
    setEmailVerifyToken('')
    setOtpToken('')
    setLastVerifiedEmail('')
    setShowVerifyBtn(false)
    setShowVerifyRow(false)
    setShowRegisteredRow(false)
    setVerifyCode('')
    setGuestOverride(false)
    setOtpError('')
  }

  function clearFieldError(field: string) {
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
  }

  async function handleEmailBlur(value = email) {
    if (isLoggedIn || !isValidEmail(value)) return
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(value)}`)
      const data = await res.json() as { status: string; registered?: boolean }
      if (data.status !== 'success') return
      if (data.registered) {
        setShowRegisteredRow(true)
        setShowVerifyBtn(false)
      } else {
        setShowVerifyBtn(true)
        setShowRegisteredRow(false)
      }
    } catch { /* swallow */ }
  }

  function handleEmailChange(val: string) {
    setEmail(val)
    if (emailVerified && val !== lastVerifiedEmail) resetEmailVerification()
    if (guestOverride && val !== lastVerifiedEmail) {
      setGuestOverride(false)
      setShowRegisteredRow(false)
    }
    // Debounced email check — fires 800ms after user stops typing
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current)
    if (isValidEmail(val) && !isLoggedIn) {
      emailCheckTimer.current = setTimeout(() => void handleEmailBlur(), 800)
    } else {
      setShowVerifyBtn(false)
      setShowRegisteredRow(false)
    }
  }

  async function sendOtp() {
    if (verifyLoading) return
    if (!turnstileToken) {
      setErrors(prev => ({ ...prev, email: __('ordErrTurnstileReq') }))
      document.getElementById('turnstile-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setVerifyLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang: locale, 'cf-turnstile-response': turnstileToken }),
      })
      const data = await res.json() as { status: string; token?: string; message?: string }
      if (data.status === 'success' && data.token) {
        setOtpToken(data.token)
        setShowVerifyRow(true)
        setShowVerifyBtn(false)
        setResendCountdown(60)
        setOtpError('')
      } else {
        setErrors(prev => ({ ...prev, email: data.message ?? 'Failed to send code.' }))
      }
    } catch {
      setErrors(prev => ({ ...prev, email: 'Failed to send code.' }))
    } finally {
      // Siteverify tokens are single-use, including failed issuance attempts.
      // Checkout and resends must receive a fresh token from the widget.
      setTurnstileToken('')
      setTurnstileKey(key => key + 1)
      setVerifyLoading(false)
    }
  }

  async function submitOtp(code: string) {
    if (code.length !== 6 || verifyLoading) return
    setVerifyLoading(true)
    setOtpError('')
    try {
      const res = await fetch(isLoggedIn ? '/api/auth/verify-email' : '/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: otpToken, code }),
      })
      const data = await res.json() as { status: string; message?: string; emailVerified?: boolean }
      if (res.ok && data.status === 'success' && (!isLoggedIn || data.emailVerified === true)) {
        setEmailVerified(true)
        setEmailVerifyToken(otpToken)
        setLastVerifiedEmail(email)
        setShowVerifyRow(false)
        clearFieldError('email')
      } else {
        setOtpError(data.message ?? 'Verification failed.')
      }
    } catch {
      setOtpError('Verification failed. Please try again.')
    } finally {
      setVerifyLoading(false)
    }
  }

  function handlePostcodeChange(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 5)
    setPostcode(digits)
    zoneRequestId.current += 1
    setZone(null)
    setSelectedCourier(null)
    if (zoneTimer.current) clearTimeout(zoneTimer.current)
    if (digits.length === 5) {
      setZoneLoading(true)
      zoneTimer.current = setTimeout(() => detectZone(digits), 300)
    } else {
      setZoneLoading(false)
    }
  }

  async function detectZone(pc: string) {
    const requestId = ++zoneRequestId.current
    setZoneLoading(true)
    setZone(null)
    setSelectedCourier(null)
    try {
      const res = await fetch(`/api/orders/zone?postcode=${pc}`)
      const data = await res.json() as { status: string; zone?: 'WM' | 'EM' | 'Labuan'; message?: string }
      if (requestId !== zoneRequestId.current) return
      if (data.status === 'success' && data.zone) {
        setZone(data.zone)
        clearFieldError('postcode')
      } else {
        setZone(null)
        setSelectedCourier(null)
        setErrors(prev => ({ ...prev, postcode: __('ordErrPostNotFound') }))
        setPostcodeAttempted(true)
        if (inquiryId.current === null) {
          const payload = {
            session_id:    sessionId.current,
            postcode:      pc,
            full_name:     fullName   || undefined,
            email:         email      || undefined,
            phone:         normalisePhone(phone) || phone || undefined,
            alt_phone:     altPhone ? (normalisePhone(altPhone) || altPhone || undefined) : undefined,
            address_line1: address1  || undefined,
            address_line2: address2  || undefined,
            city:          city      || undefined,
            state:         stateName || undefined,
          }
          fetch('/api/orders/postcode-inquiry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
            .then(r => r.json())
            .then((d: { status: string; id?: number }) => {
              if (d.status === 'success' && d.id) inquiryId.current = d.id
            })
            .catch(() => { /* non-blocking */ })
        } else {
          updateInquiry({ postcode: pc })
        }
      }
    } catch {
      if (requestId !== zoneRequestId.current) return
      setZone(null)
      setSelectedCourier(null)
    } finally {
      if (requestId === zoneRequestId.current) setZoneLoading(false)
    }
  }

  function updateInquiry(extraPayload: any = {}) {
    if (inquiryId.current === null) return
    const payload = {
      session_id:    sessionId.current,
      postcode,
      full_name:     fullName   || undefined,
      email:         email      || undefined,
      phone:         normalisePhone(phone) || phone || undefined,
      alt_phone:     altPhone ? (normalisePhone(altPhone) || altPhone || undefined) : undefined,
      address_line1: address1  || undefined,
      address_line2: address2  || undefined,
      city:          city      || undefined,
      state:         stateName || undefined,
      ...extraPayload
    }
    fetch(`/api/orders/postcode-inquiry/${inquiryId.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* non-blocking */ })
  }

  function handleWaClick() {
    updateInquiry({ wa_opened: true })
    const lines = [
      `Hi Eastel! I tried to order a SIM but postcode ${postcode} isn't in your delivery zone list.`,
      '',
      'My details:',
      `• Name: ${fullName || '-'}`,
      `• Phone: ${normalisePhone(phone) || phone || '-'}`,
      `• Address: ${[address1, address2].filter(Boolean).join(', ') || '-'}`,
      `• City: ${city || '-'}`,
      `• State: ${stateName || '-'}`,
      '',
      'Can you check if delivery is available to my area?',
    ]
    window.open(
      `https://wa.me/601175999733?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank'
    )
  }

  function validateAll(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!fullName.trim()) e.fullName = __('ordErrNameReq')
    else if (fullName.trim().length < 3) e.fullName = __('ordErrNameLen')
    if (!email.trim()) e.email = __('ordErrEmailReq')
    else if (!isValidEmail(email)) e.email = __('ordErrEmailInv')
    if (!phone.trim()) e.phone = __('ordErrPhoneReq')
    else if (!normalisePhone(phone)) e.phone = __('ordErrPhoneInv')
    if (altPhone && !normalisePhone(altPhone)) e.altPhone = __('ordErrPhoneInv')
    if (!address1.trim()) e.address1 = __('ordErrAddr1Req')
    else if (address1.trim().length < 3) e.address1 = __('ordErrAddr1Len')
    if (!postcode.trim()) e.postcode = __('ordErrPostReq')
    else if (!/^\d{5}$/.test(postcode)) e.postcode = __('ordErrPostInv')
    if (!city.trim()) e.city = __('ordErrCityReq')
    if (!stateName) e.stateName = __('ordErrStateReq')
    return e
  }

  async function handleSubmit(method: 'fpx' | 'dnqr', e?: FormEvent) {
    e?.preventDefault()
    if (!planReady) { setSubmitError(planError); return }
    if (isSubmitting || checkingDnqr || !checkoutReady || !selectedCourier) {
      setSubmitError(!product?.available ? (product ? checkoutCopy.outOfStock : checkoutCopy.unavailable) : checkoutCopy.shippingUnavailable)
      return
    }
    if (!emailVerified || !turnstileToken) { handlePayClick(method); return }
    const allErrors = validateAll()
    if (Object.keys(allErrors).length > 0) { setErrors(allErrors); return }

    const normPhone = normalisePhone(phone)
    const normAlt = altPhone ? normalisePhone(altPhone) : null

    setIsSubmitting(true)
    setSubmitError('')
    setShowEmailRegisteredError(false)

    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: normPhone,
          alt_phone: normAlt,
          address_line1: address1,
          address_line2: address2 || null,
          postcode,
          city,
          state: stateName,
          country: 'Malaysia',
          courier_id: selectedCourier.id,
          lang: locale,
          'cf-turnstile-response': turnstileToken,
          email_verify_token: emailVerifyToken,
          guest_override: guestOverride,
          payment_method: method,
          voucher_code: appliedVoucher ? appliedVoucher.code : null,
          ...(purchasedPlan ? { plan_id: purchasedPlan.id, plan_price_cents: Math.round(purchasedPlan.price * 100) } : {}),
        }),
      })
      const data = await res.json() as {
        status: string
        payment_url?: string
        order_ref?: string
        error_code?: string
        message?: string
      }

      if (data.status === 'success') {
        try { sessionStorage.removeItem(FORM_SS_KEY) } catch { /* ignore */ }
        if (data.payment_url) {
          window.location.href = data.payment_url
        } else {
          router.push(`/${locale}/thankyou?ref=${data.order_ref}`)
        }
        return
      }

      if (data.error_code === 'email_registered') {
        setShowEmailRegisteredError(true)
        setTurnstileKey(k => k + 1)
        setTurnstileToken('')
      } else {
        setSubmitError(data.message ?? __('ordErrPayFail'))
        if (data.error_code === 'plan_price_changed') setPlanReload(value => value + 1)
        setTurnstileKey(k => k + 1)
        setTurnstileToken('')
      }
    } catch {
      setSubmitError(__('ordErrPayFail'))
      setTurnstileKey(k => k + 1)
      setTurnstileToken('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {(initializing || aiCheckoutNotice) && (
        <div role="status" className="mb-5 p-4 rounded-xl border border-outline-variant bg-surface-container-low text-sm text-on-surface">
          {initializing ? checkoutCopy.loading : aiCheckoutNotice === 'invalid' ? checkoutCopy.aiInvalid : aiCheckoutNotice === 'account' ? checkoutCopy.aiAccountEmail : checkoutCopy.aiApplied}
        </div>
      )}
      <div className="grid lg:grid-cols-5 gap-8 items-start">

        {/* Form Column (3/5) */}
        <form onSubmit={(e) => handleSubmit('fpx', e)} className="lg:col-span-3 space-y-6">
          <fieldset disabled={initializing} className="space-y-6">
          <OrderPlanSelector
            locale={locale}
            purchaseMode={purchaseMode}
            selectedPlanId={selectedPlanId}
            plans={planCatalogue?.plans.filter(plan => plan.status === 'available') ?? []}
            selectedPlan={selectedPlan}
            loading={plansLoading}
            failed={plansFailed}
            disabled={initializing || isSubmitting}
            onPurchaseModeChange={mode => { setPurchaseMode(mode); setSubmitError('') }}
            onPlanChange={id => { setSelectedPlanId(id); setSubmitError('') }}
            onRetry={() => setPlanReload(value => value + 1)}
          />
          <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
            <h2 className="text-on-surface font-semibold text-lg mb-6">{__('ordFormTitle')}</h2>

            {/* Full Name + Email */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="fullName">
                  {__('ordLblFullName')} <span className="text-error">*</span>
                </label>
                {/* Input wraps in a flex-col div; we pass className to the inner input via forwarded props */}
                <input
                  id="fullName"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onBlur={() => {
                    updateInquiry()
                    if (!fullName.trim()) setErrors(p => ({ ...p, fullName: __('ordErrNameReq') }))
                  }}
                  placeholder={__('ordPlaceName')}
                  className={[
                    'w-full h-11 rounded-[var(--radius-md)] border px-4 text-base sm:text-sm',
                    'bg-surface text-text-primary placeholder:text-text-tertiary',
                    'transition-colors duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand',
                    errors.fullName ? 'border-red-500 focus:ring-red-500/40 focus:border-red-500' : 'border-border',
                  ].join(' ')}
                />
                {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="email">
                  {__('ordLblEmail2')} <span className="text-error">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      if (emailVerified) { setEmailVerified(false); setTurnstileToken('') }
                    }}
                    onBlur={() => {
                      updateInquiry()
                      handleEmailBlur()
                    }}
                    disabled={emailVerified || isLoggedIn}
                    className={[
                      'flex-1 h-11 rounded-[var(--radius-md)] border px-4 text-base sm:text-sm',
                      'bg-surface text-text-primary placeholder:text-text-tertiary',
                      'transition-colors duration-150',
                      'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand',
                      'disabled:opacity-75',
                      errors.email ? 'border-red-500 focus:ring-red-500/40 focus:border-red-500' : 'border-border',
                    ].join(' ')}
                  />
                  {showVerifyBtn && !emailVerified && (
                    <button type="button" onClick={sendOtp} disabled={verifyLoading}
                      className="shrink-0 px-3 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition">
                      {verifyLoading ? '…' : __('ordVerifyBtn')}
                    </button>
                  )}
                  {emailVerified && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-success font-medium">{__('ordVerified')}</span>
                      {!isLoggedIn && (
                        <button type="button" onClick={resetEmailVerification} className="text-xs text-primary underline">
                          {__('ordChangeEmail')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                <p className="text-xs text-on-surface-variant mt-1">{__('ordHintEmail')}</p>

                {showRegisteredRow && (
                  <div className="mt-3 p-3 rounded-xl border border-tertiary/30 bg-tertiary/10 flex items-start gap-3">
                    <span className="text-tertiary text-lg">✓</span>
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-on-surface">{__('ordEmailAlreadyRegistered')}</p>
                      <p className="text-on-surface-variant text-xs">{__('ordContinueWithoutLogin')}</p>
                      <div className="flex gap-2 mt-2">
                        <button type="button"
                          onClick={() => { setGuestOverride(true); setShowRegisteredRow(false); setShowVerifyBtn(true); sendOtp() }}
                          className="px-3 py-1 text-xs font-semibold bg-tertiary text-on-tertiary rounded-lg">
                          {__('ordRegYes')}
                        </button>
                        <button type="button"
                          onClick={() => router.push(`/${locale}/account/login?redirect=${encodeURIComponent(checkoutReturnPath)}`)}
                          className="px-3 py-1 text-xs font-medium border border-outline-variant text-on-surface rounded-lg">
                          {__('ordRegNo')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showVerifyRow && (
                  <div className="mt-3 p-3 rounded-xl border border-outline-variant bg-surface-container-low">
                    <label className="block text-xs font-medium text-on-surface-variant mb-2">{__('ordOtpPh')}</label>
                    <div className="flex gap-2">
                      <Input
                        value={verifyCode}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setVerifyCode(v)
                          if (v.length === 6) submitOtp(v)
                        }}
                        placeholder="000000"
                        maxLength={6}
                        className="w-32 tracking-widest text-center font-mono"
                        disabled={verifyLoading}
                      />
                      <button type="button" onClick={() => submitOtp(verifyCode)}
                        disabled={verifyCode.length !== 6 || verifyLoading}
                        className="px-3 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg disabled:opacity-50">
                        {verifyLoading ? '…' : __('ordVerifyCode')}
                      </button>
                      <button type="button" onClick={sendOtp}
                        disabled={resendCountdown > 0 || verifyLoading}
                        className="px-3 py-2 text-xs text-primary disabled:opacity-40">
                        {resendCountdown > 0 ? __('ordResendIn').replace('{n}', String(resendCountdown)) : __('ordResend')}
                      </button>
                    </div>
                    {otpError && <p className="text-red-500 text-xs mt-1">{otpError}</p>}
                  </div>
                )}
                {/* Amber banner: OTP sent but not yet verified — reminds customer to check email */}
                {showVerifyRow && !emailVerified && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <span className="text-amber-400 text-sm shrink-0 mt-px">📧</span>
                    <p className="text-xs text-amber-300 leading-relaxed">
                      {__('ordOtpBanner', 'Check your email for the 6-digit code — required before payment.')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Phone + Alt Phone */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              {(
                [
                  { id: 'phone', label: __('ordLblPhone2'), val: phone, set: setPhone, err: errors.phone, req: true },
                  { id: 'altPhone', label: `${__('ordLblAltPhone')} ${__('ordOptional')}`, val: altPhone, set: setAltPhone, err: errors.altPhone, req: false },
                ] as Array<{ id: string; label: string; val: string; set: (v: string) => void; err: string | undefined; req: boolean }>
              ).map(({ id, label, val, set, err, req }) => (
                <div key={id}>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor={id}>
                    {label} {req && <span className="text-error">*</span>}
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center justify-center px-3.5 border border-r-0 border-border rounded-l-[var(--radius-md)] bg-surface-container-low text-on-surface-variant text-sm font-medium h-11 shrink-0 whitespace-nowrap">
                      +60
                    </span>
                    <input
                      id={id}
                      value={val}
                      onChange={e => set(e.target.value)}
                      onBlur={() => {
                        updateInquiry()
                        if (req && val && !normalisePhone(val)) {
                          setErrors(p => ({ ...p, [id]: __('ordErrPhoneInv') }))
                        }
                      }}
                      placeholder="11-12345678"
                      className={[
                        'flex-1 h-11 rounded-l-none rounded-r-[var(--radius-md)] border px-4 text-base sm:text-sm',
                        'bg-surface text-text-primary placeholder:text-text-tertiary',
                        'transition-colors duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand',
                        err ? 'border-red-500 focus:ring-red-500/40 focus:border-red-500' : 'border-border',
                      ].join(' ')}
                    />
                  </div>
                  {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
                </div>
              ))}
            </div>

            {/* Address 1 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="addr1">
                {__('ordLblAddr1')} <span className="text-error">*</span>
              </label>
              <Input
                id="addr1"
                value={address1}
                onChange={e => setAddress1(e.target.value)}
                onBlur={() => {
                  updateInquiry()
                  if (!address1.trim()) setErrors(p => ({ ...p, address1: __('ordErrAddr1Req') }))
                }}
                placeholder={__('ordPlaceAddr1')}
                error={errors.address1}
              />
            </div>

            {/* Address 2 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="addr2">
                {__('ordLblAddr2')} <span className="text-on-surface-variant/60">{__('ordOptional')}</span>
              </label>
              <Input id="addr2" value={address2} onChange={e => setAddress2(e.target.value)} onBlur={() => updateInquiry()} placeholder={__('ordPlaceAddr2')} />
            </div>

            {/* Postcode + City */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="postcode">
                  {__('ordLblPostcode')} <span className="text-error">*</span>
                  {zone && (
                    <span className="ml-2 text-xs font-semibold text-primary animate-in fade-in duration-300">
                      {zoneBadge(zone, tr)}
                    </span>
                  )}
                  {zoneLoading && <span className="ml-2 text-xs text-on-surface-variant animate-pulse">{__('ordDetectingZone')}</span>}
                </label>
                <div className={zoneLoading ? 'ring-2 ring-primary/50 ring-offset-1 ring-offset-surface-container rounded-[var(--radius-md)] transition-all' : ''}>
                  <Input
                    id="postcode"
                    value={postcode}
                    onChange={e => handlePostcodeChange(e.target.value)}
                    placeholder="50000"
                    maxLength={5}
                    error={errors.postcode}
                  />
                </div>
                <p className="text-xs text-on-surface-variant mt-1">{__('ordHintPostcode')}</p>
                {postcodeAttempted && zone === null && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleWaClick}
                      className="inline-flex items-center gap-1.5 bg-[#25d366] text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-sm hover:bg-[#20bb5a] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.115.55 4.1 1.517 5.823L.057 23.882a.5.5 0 0 0 .606.61l6.218-1.634A11.938 11.938 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.016-1.374l-.36-.214-3.732.98.998-3.648-.234-.374A9.818 9.818 0 1 1 12 21.818z"/>
                      </svg>
                      {__('ordWaUsBtn')}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="city">
                  {__('ordLblCity')} <span className="text-error">*</span>
                </label>
                <Input
                  id="city"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  onBlur={() => {
                    updateInquiry()
                    if (!city.trim()) setErrors(p => ({ ...p, city: __('ordErrCityReq') }))
                  }}
                  placeholder={__('ordPlaceCity')}
                  error={errors.city}
                />
              </div>
            </div>

            {/* State + Country */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="stateName">
                  {__('ordLblState')} <span className="text-error">*</span>
                </label>
                <select
                  id="stateName"
                  value={stateName}
                  onChange={e => setStateName(e.target.value)}
                  onBlur={() => updateInquiry()}
                  className={[
                    'w-full h-11 rounded-[var(--radius-md)] border px-3',
                    'bg-surface text-text-primary text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand',
                    'transition-colors duration-150',
                    errors.stateName ? 'border-red-500' : 'border-border',
                  ].join(' ')}
                >
                  <option value="">{__('ordPlaceState')}</option>
                  {MY_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.stateName && <p className="text-red-500 text-xs mt-1">{errors.stateName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1" htmlFor="country">
                  {__('ordLblCountry')}
                </label>
                <Input id="country" value="Malaysia" readOnly className="opacity-60 cursor-not-allowed" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-primary-container/20 border border-primary-container/40 text-xs text-on-surface-variant">
              {__('ordDisclaimer2')}
            </div>
          </div>
          </fieldset>
        </form>

        {/* Summary Column (2/5) */}
        <div className="lg:col-span-2">
          <div className="sticky top-24">
            <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
              <h2 className="text-on-surface font-semibold text-lg mb-5">{__('ordSummaryTitle')}</h2>

              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">{product?.name ?? __('ordSumSimName')}</p>
                  <p className="text-xs text-on-surface-variant">{__('ordSumSimSub')}</p>
                </div>
                <span className="text-sm font-semibold text-on-surface tabular-nums">{product ? `RM ${simFee.toFixed(2)}` : '—'}</span>
              </div>

              {purchaseMode === 'sim_and_plan' && (
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{planCopy.planFee}</p>
                    <p className="text-xs text-on-surface-variant">{purchasedPlan?.name ?? planCopy.selectPlan}</p>
                    {purchasedPlan && <p className="text-xs text-on-surface-variant">{purchasedPlan.validityDays} {planCopy.days}</p>}
                  </div>
                  <span className="text-sm font-semibold text-on-surface tabular-nums">{planReady && purchasedPlan ? `RM ${planFee.toFixed(2)}` : '—'}</span>
                </div>
              )}

              {!storefrontLoading && (storefrontFailed || !product || !product.available || (zone && !selectedCourier)) && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
                  <p>{storefrontFailed || !product ? checkoutCopy.unavailable : !product.available ? checkoutCopy.outOfStock : checkoutCopy.shippingUnavailable}</p>
                  <button type="button" onClick={() => setStorefrontReload(value => value + 1)} className="mt-2 underline">
                    {checkoutCopy.retry}
                  </button>
                </div>
              )}

              {zone && selectedCourier && (
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{selectedCourier.name}</p>
                    <p className="text-xs text-on-surface-variant">{zoneBadge(zone, tr)}</p>
                  </div>
                  <span className="text-sm font-semibold text-on-surface tabular-nums">RM {deliveryFee.toFixed(2)}</span>
                </div>
              )}

              {zone && (
                <div className="mb-4 p-2 rounded-lg bg-primary-container/20 border border-primary-container/30 text-xs text-on-surface-variant">
                  {zoneBadge(zone, tr)} · {__('ordZoneDetected')}
                </div>
              )}

              <p className="text-xs text-on-surface-variant mb-4">{__('ordRefundNote')}</p>

              {appliedVoucher && (
                <div className="flex justify-between items-start mb-3 text-green-500">
                  <div>
                    <p className="text-sm font-medium">Discount ({appliedVoucher.code})</p>
                    <button
                      type="button"
                      onClick={() => setAppliedVoucher(null)}
                      className="text-xs text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">-RM {appliedVoucher.discount.toFixed(2)}</span>
                </div>
              )}

              {isLoggedIn && !appliedVoucher && (
                <div className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Promo Code"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      className="flex-1 h-9 rounded-lg border border-outline-variant px-3 text-xs bg-surface text-on-surface focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyVoucher}
                      disabled={validatingVoucher || !voucherCode.trim() || !shippingReady}
                      className="px-3 h-9 text-xs font-semibold bg-primary text-on-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
                    >
                      {validatingVoucher ? "..." : "Apply"}
                    </button>
                  </div>
                  {voucherError && <p className="text-red-500 text-xs mt-1">{voucherError}</p>}
                </div>
              )}

              {!isLoggedIn && (
                <div className="mb-4 text-xs text-on-surface-variant">
                  <Link
                    href={`/${locale}/account/login?redirect=${encodeURIComponent(checkoutReturnPath)}`}
                    className="text-primary underline"
                  >
                    Log in
                  </Link> to apply promo codes.
                </div>
              )}

              <hr className="border-outline-variant mb-4" />

              <div className="flex justify-between items-center mb-5">
                <span className="font-semibold text-on-surface">{__('ordTotalPayable')}</span>
                <span className="text-xl font-bold text-on-surface tabular-nums">
                  {checkoutReady ? `RM ${total.toFixed(2)}` : '—'}
                </span>
              </div>

              {postcodeAttempted && zone === null && (
                <div className="bg-teal-950 border border-teal-700 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 bg-[#25d366] rounded-full flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.115.55 4.1 1.517 5.823L.057 23.882a.5.5 0 0 0 .606.61l6.218-1.634A11.938 11.938 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.016-1.374l-.36-.214-3.732.98.998-3.648-.234-.374A9.818 9.818 0 1 1 12 21.818z"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-teal-50">{__('ordWaCardTitle')}</p>
                      <p className="text-xs text-teal-300 mt-0.5">{__('ordWaCardSub')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleWaClick}
                    className="w-full bg-[#25d366] hover:bg-[#20bb5a] text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                  >
                    {__('ordWaChatBtn')}
                  </button>
                  <p className="text-[10px] text-teal-400 text-center mt-2">{__('ordWaPreFilled')}</p>
                </div>
              )}
              {/* TurnstileWidget — onToken receives token string; empty string means expired */}
              <div className="mb-4">
                <TurnstileWidget
                  key={turnstileKey}
                  action="order"
                  onToken={setTurnstileToken}
                />
              </div>

              <Button
                type="button"
                disabled={isSubmitting || !checkoutReady}
                loading={isSubmitting || checkingDnqr || initializing || storefrontLoading || zoneLoading}
                fullWidth
                size="lg"
                onClick={() => handlePayClick('fpx')}
              >
                {buttonLabel}
              </Button>

              {submitError && (
                <div className="mt-3 p-3 rounded-xl bg-error/10 border border-error/30 text-sm text-error">
                  {submitError}
                </div>
              )}

              {showEmailRegisteredError && (
                <div className="mt-3 p-3 rounded-xl bg-surface-container-high border border-outline-variant text-sm">
                  <p className="text-on-surface mb-2">{__('ordEmailRegisteredPayMsg')}</p>
                  <div className="flex gap-2">
                    <a
                      href={`/${locale}/account/login?redirect=${encodeURIComponent(checkoutReturnPath)}`}
                      className="px-3 py-1 text-xs font-semibold bg-primary text-on-primary rounded-lg"
                    >
                      {__('ordLoginBtn')}
                    </a>
                    <button type="button"
                      onClick={() => { setGuestOverride(true); setShowEmailRegisteredError(false) }}
                      className="px-3 py-1 text-xs border border-outline-variant text-on-surface rounded-lg">
                      {__('ordContinueGuest')}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs text-on-surface-variant">
                <span className="px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant">🔒 Secure</span>
                <span className="px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant">🏦 FPX</span>
                {dnqrAvailable && <span className="px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant">📱 DuitNow QR</span>}
                <span className="px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant">✅ ToyyibPay</span>
              </div>

              <div className="mt-3 text-center text-xs text-on-surface-variant">
                <span>{__('ordNeedHelp')} </span>
                <a href="https://wa.me/601175999733" target="_blank" rel="noopener noreferrer"
                  className="text-primary underline">{__('ordChatWA')}</a>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile sticky payment bar — fixed at bottom on small screens */}
        <div
          className="fixed bottom-0 left-0 right-0 md:hidden z-30 bg-surface-container border-t border-outline-variant px-4 pt-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant">{__('ordTotalPayable')}</span>
            <span className="font-bold text-on-surface tabular-nums text-sm">
              {checkoutReady ? `RM ${total.toFixed(2)}` : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handlePayClick('fpx')}
            disabled={isSubmitting || !checkoutReady}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #9b7bff, #4b8bf5)' }}
          >
            {(isSubmitting || checkingDnqr) && (
              <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span>{buttonLabel}</span>
          </button>
        </div>

      </div>
    </div>
  )
}
