'use client'

import type { RecommendationPlan } from '@/public/recommender/engine.mjs'

export const ORDER_PLAN_COPY = {
  en: {
    title: 'What would you like to buy?',
    simOnly: 'SIM card only',
    simOnlyDescription: 'Pay for the SIM card and delivery. No mobile plan or top-up is included.',
    simAndPlan: 'SIM card + mobile plan',
    simAndPlanDescription: 'Add the plan price below to your SIM card and delivery fees.',
    choosePlan: 'Choose a mobile plan',
    selectPlan: 'Select a plan',
    unavailablePlan: 'The selected plan is unavailable. Choose another plan or SIM card only.',
    catalogueUnavailable: 'Mobile plans are temporarily unavailable. Try again or choose SIM card only.',
    loading: 'Loading available plans…',
    retry: 'Try again',
    planFee: 'Mobile plan (one purchase)',
    activation: 'After receiving your SIM, register it in the official app and contact Eastel. Eastel will help top up and purchase this plan for you. This payment covers one plan purchase, with no automatic renewal.',
    data: 'Data', hotspot: 'Hotspot', shared: 'Shared with data', roaming: 'Roaming', validity: 'Validity', days: 'days',
    chooseBeforePay: 'Choose an available mobile plan before paying, or select SIM card only.',
  },
  ms: {
    title: 'Apa yang anda ingin beli?',
    simOnly: 'Kad SIM sahaja',
    simOnlyDescription: 'Bayar kad SIM dan penghantaran sahaja. Tiada pelan mudah alih atau tambah nilai disertakan.',
    simAndPlan: 'Kad SIM + pelan mudah alih',
    simAndPlanDescription: 'Harga pelan di bawah ditambah kepada harga kad SIM dan penghantaran.',
    choosePlan: 'Pilih pelan mudah alih',
    selectPlan: 'Pilih pelan',
    unavailablePlan: 'Pelan yang dipilih tidak tersedia. Pilih pelan lain atau kad SIM sahaja.',
    catalogueUnavailable: 'Pelan mudah alih tidak tersedia buat sementara waktu. Cuba lagi atau pilih kad SIM sahaja.',
    loading: 'Memuatkan pelan yang tersedia…',
    retry: 'Cuba lagi',
    planFee: 'Pelan mudah alih (satu pembelian)',
    activation: 'Selepas menerima SIM, daftarkannya dalam aplikasi rasmi dan hubungi Eastel. Eastel akan membantu menambah nilai dan membeli pelan ini untuk anda. Bayaran ini untuk satu pembelian pelan, tanpa pembaharuan automatik.',
    data: 'Data', hotspot: 'Hotspot', shared: 'Dikongsi dengan data', roaming: 'Perayauan', validity: 'Tempoh sah', days: 'hari',
    chooseBeforePay: 'Pilih pelan mudah alih yang tersedia sebelum membayar, atau pilih kad SIM sahaja.',
  },
  zh: {
    title: '您要购买什么？',
    simOnly: '只购买电话卡',
    simOnlyDescription: '只支付电话卡和运费，不包含套餐或充值。',
    simAndPlan: '电话卡 + 套餐代购',
    simAndPlanDescription: '下方套餐费用将另加在电话卡和运费上。',
    choosePlan: '选择套餐',
    selectPlan: '请选择套餐',
    unavailablePlan: '所选套餐暂不可购买，请改选其他套餐，或选择只购买电话卡。',
    catalogueUnavailable: '暂时无法获取套餐，请重试，或选择只购买电话卡。',
    loading: '正在加载可购买的套餐…',
    retry: '重试',
    planFee: '套餐代购（单次）',
    activation: '收到电话卡后，请先在官方 App 注册，再联系 Eastel。我们会为您充值并代购此套餐。本次只收取一次套餐费用，不会自动续费。',
    data: '流量', hotspot: '热点', shared: '与流量共享', roaming: '漫游', validity: '有效期', days: '天',
    chooseBeforePay: '付款前请选择可购买的套餐，或选择只购买电话卡。',
  },
}

interface OrderPlanSelectorProps {
  locale: string
  purchaseMode: 'sim_only' | 'sim_and_plan'
  selectedPlanId: string
  plans: RecommendationPlan[]
  selectedPlan: RecommendationPlan | null
  loading: boolean
  failed: boolean
  disabled: boolean
  onPurchaseModeChange: (mode: 'sim_only' | 'sim_and_plan') => void
  onPlanChange: (id: string) => void
  onRetry: () => void
}

export function OrderPlanSelector({
  locale, purchaseMode, selectedPlanId, plans, selectedPlan, loading, failed, disabled,
  onPurchaseModeChange, onPlanChange, onRetry,
}: OrderPlanSelectorProps) {
  const copy = ORDER_PLAN_COPY[locale as keyof typeof ORDER_PLAN_COPY] ?? ORDER_PLAN_COPY.en
  const bundle = purchaseMode === 'sim_and_plan'

  return (
    <fieldset id="order-plan-choice" disabled={disabled} className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
      <legend className="sr-only">{copy.title}</legend>
      <h2 className="text-on-surface font-semibold text-lg mb-4">{copy.title}</h2>
      <div className="space-y-3">
        {(['sim_only', 'sim_and_plan'] as const).map(mode => (
          <label key={mode} className="flex gap-3 p-3 rounded-xl border border-outline-variant cursor-pointer">
            <input
              type="radio" name="purchase_mode" value={mode} checked={purchaseMode === mode}
              onChange={() => onPurchaseModeChange(mode)} className="mt-1 accent-primary"
            />
            <span>
              <span className="block text-sm font-semibold text-on-surface">{mode === 'sim_only' ? copy.simOnly : copy.simAndPlan}</span>
              <span className="block text-xs text-on-surface-variant mt-1">{mode === 'sim_only' ? copy.simOnlyDescription : copy.simAndPlanDescription}</span>
            </span>
          </label>
        ))}
      </div>
      {bundle && (
        <div className="mt-4 space-y-3">
          <label htmlFor="order-plan-id" className="block text-sm font-medium text-on-surface">{copy.choosePlan}</label>
          <select
            id="order-plan-id" value={selectedPlanId} disabled={loading || failed}
            onChange={event => onPlanChange(event.target.value)}
            className="w-full h-11 rounded-lg border border-outline-variant bg-surface text-on-surface px-3 text-sm"
          >
            <option value="">{copy.selectPlan}</option>
            {selectedPlanId && !selectedPlan && <option value={selectedPlanId} disabled>{copy.unavailablePlan}</option>}
            {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · RM {plan.price.toFixed(2)} · {plan.validityDays} {copy.days}</option>)}
          </select>
          {loading ? (
            <p role="status" className="text-sm text-on-surface-variant">{copy.loading}</p>
          ) : failed || !selectedPlan ? (
            <div role="alert" className="p-3 rounded-xl border border-error/30 bg-error/10 text-sm text-error">
              <p>{failed ? copy.catalogueUnavailable : selectedPlanId ? copy.unavailablePlan : copy.chooseBeforePay}</p>
              <button type="button" onClick={onRetry} className="mt-2 underline">{copy.retry}</button>
            </div>
          ) : (
            <div className="rounded-xl border border-primary/30 bg-primary-container/20 p-3 text-sm text-on-surface">
              <p className="font-semibold">{selectedPlan.name} · RM {selectedPlan.price.toFixed(2)}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                <div><dt className="text-on-surface-variant">{copy.data}</dt><dd>{selectedPlan.dataGB} GB</dd></div>
                <div><dt className="text-on-surface-variant">{copy.hotspot}</dt><dd>{selectedPlan.hotspotGB} GB{selectedPlan.hotspotMode === 'shared' ? ` (${copy.shared})` : ''}</dd></div>
                <div><dt className="text-on-surface-variant">{copy.roaming}</dt><dd>{selectedPlan.roamingGB} GB</dd></div>
                <div><dt className="text-on-surface-variant">{copy.validity}</dt><dd>{selectedPlan.validityDays} {copy.days}</dd></div>
              </dl>
            </div>
          )}
          <p className="text-xs text-on-surface-variant">{copy.activation}</p>
        </div>
      )}
    </fieldset>
  )
}
