import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Locale } from '@/lib/i18n'
import { isValidLocale, t } from '@/lib/i18n'
import { getTranslations } from '@/lib/i18n-server'
import { buildMetadata } from '@/components/seo-head'
import { SITE_URL } from '@/lib/site'
import { JsonLd, PublicPageJsonLd } from '@/components/json-ld'
import { buildSimProduct } from '@/lib/structured-data'
import { readPublicSim } from '@/lib/public-product'
import OrderForm from './_components/OrderForm'

interface OrderPageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: OrderPageProps): Promise<Metadata> {
  const { locale } = await params
  const tr = await getTranslations(locale as Locale)

  return buildMetadata({
    title: t(tr, 'seoTitleOrder', 'Buy Eastel SIM Card | Order 5G Prepaid Malaysia'),
    description: t(tr, 'seoDescOrder', 'Order your Eastel Prepaid SIM card online. Fast delivery to your doorstep. Pay securely via FPX.'),
    locale,
    canonical: `${SITE_URL}/${locale}/order`,
  })
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { locale } = await params
  if (!isValidLocale(locale)) redirect('/ms/order')

  const tr = await getTranslations(locale as Locale)

  // Request-time catalogue data; the create-order endpoint remains authoritative.
  const sim = await readPublicSim()
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <div className="min-h-screen bg-background">
      <PublicPageJsonLd translations={tr} locale={locale} path="order"
        title={t(tr, 'seoTitleOrder')} description={t(tr, 'seoDescOrder')} nonce={nonce} />
      <JsonLd nonce={nonce} data={buildSimProduct({ origin: SITE_URL, locale,
        name: t(tr, 'ordSumSimName'), description: t(tr, 'seo.simPriceNote'),
        price: sim?.canOrder ? sim.price : undefined })} />
      {/* Hero */}
      <div className="bg-surface-container-low border-b border-outline-variant py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest uppercase bg-primary-container text-on-primary-container rounded-full mb-3">
            Order
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-on-surface mt-2">
            {t(tr, 'ordHeroTitle', 'Get Your Eastel SIM')}
          </h1>
          <p className="mt-2 text-on-surface-variant text-base max-w-xl">
            {t(tr, 'ordHeroSub', 'Fast delivery to your doorstep. Fill in your details and pay securely via FPX.')}
          </p>
          <p className="mt-4 text-sm text-on-surface-variant">
            {t(tr, 'seo.simPrice')}: {sim ? `RM ${sim.price.toFixed(2)}` : '—'}.{' '}
            {t(tr, 'seo.simPriceNote')}
          </p>
          {!sim?.canOrder && <p role="status" className="mt-4 text-sm text-on-surface-variant">
            {t(tr, sim ? 'ordSoldOut' : 'ordCatalogUnavailable')}
          </p>}
          <nav className="mt-4 flex flex-wrap gap-4 text-sm text-accent underline" aria-label={t(tr, 'seo.help')}>
            <Link href={`/${locale}/delivery`}>{t(tr, 'delivery.heading')}</Link>
            <Link href={`/${locale}/terms`}>{t(tr, 'terms.heading')}</Link>
            <Link href={`/${locale}/faq`}>{t(tr, 'seo.help')}</Link>
          </nav>
        </div>
      </div>

      {/* Order form (client component) */}
      <OrderForm locale={locale} tr={tr} />
    </div>
  )
}
