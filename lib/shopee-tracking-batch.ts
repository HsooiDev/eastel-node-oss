export interface RefreshableShopeeOrder {
  id: number
  status: string
}

export type ShopeeOrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface ShopeeTrackingScanResult {
  ok: boolean
  message: string
  orderStatus?: ShopeeOrderStatus | null
  trackingData?: string | null
}

export interface ShopeeTrackingOrderRequest {
  id: number
  tracking_number: string
}

export interface ShopeeTrackingBatchItemResult<TOrder extends RefreshableShopeeOrder> {
  order: TOrder
  result: ShopeeTrackingScanResult
}

/** The client budget includes the API route's 12s SPX and 6s fallback limits. */
export async function requestShopeeTrackingScan(
  order: ShopeeTrackingOrderRequest,
  fetcher: typeof fetch = fetch
): Promise<ShopeeTrackingScanResult> {
  const response = await fetcher('/api/admin/shopee-tracking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'fetch_shopee_tracking',
      id: order.id,
      tracking_number: order.tracking_number,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await response.json()

  if (!response.ok || data.status !== 'success') {
    return { ok: false, message: data.message || `Tracking request failed (${response.status}).` }
  }

  const validStatuses: readonly ShopeeOrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
  const orderStatus = validStatuses.find((status) => status === data.order_status) ?? null

  return {
    ok: true,
    message: orderStatus ? `Updated: ${orderStatus}` : 'Tracking refreshed.',
    orderStatus,
    trackingData: data.tracking_data ?? null,
  }
}

export function getRefreshableShopeeOrders<TOrder extends RefreshableShopeeOrder>(orders: readonly TOrder[]): TOrder[] {
  return orders.filter(order => order.status !== 'delivered' && order.status !== 'cancelled')
}

/** Refresh in sequence so Refresh All applies the provider's existing one-order-at-a-time limit. */
export async function refreshShopeeOrdersSequentially<TOrder extends RefreshableShopeeOrder>(
  orders: readonly TOrder[],
  scan: (order: TOrder) => Promise<ShopeeTrackingScanResult>,
  onResult?: (item: ShopeeTrackingBatchItemResult<TOrder>) => void
): Promise<ShopeeTrackingBatchItemResult<TOrder>[]> {
  const results: ShopeeTrackingBatchItemResult<TOrder>[] = []

  for (const order of orders) {
    let result: ShopeeTrackingScanResult
    try {
      result = await scan(order)
    } catch (cause) {
      result = {
        ok: false,
        message: cause instanceof Error ? cause.message : 'Tracking refresh failed.',
      }
    }

    const item = { order, result }
    results.push(item)
    onResult?.(item)
  }

  return results
}
