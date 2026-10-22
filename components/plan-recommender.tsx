'use client'

import { useEffect, useRef } from 'react'
import { mountRecommender, mountAdmin, mountSelection } from '@/public/recommender/ui.mjs'
import '@/public/recommender/widget.css'

export function PlanRecommender({ locale }: { locale: string }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!root.current) return
    return mountRecommender(root.current, {
      locale,
      endpoint: '/api/plan-recommender',
      orderUrl: `/${locale}/order`,
    })
  }, [locale])
  return <div ref={root} />
}

export function PlanRecommenderAdmin() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!root.current) return
    return mountAdmin(root.current, { endpoint: '/api/admin/plan-recommender' })
  }, [])
  return <div ref={root} />
}

export function SelectedPlan({ locale }: { locale: string }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!root.current) return
    return mountSelection(root.current, { locale, endpoint: '/api/plan-recommender' })
  }, [locale])
  return <div ref={root} />
}
