import { getStorefrontCheckout } from "@/lib/storefront";

export interface PublicSim {
  price: number;
  canOrder: boolean;
}

/** Reuse the existing public checkout catalogue; never invent a fallback offer. */
export async function readPublicSim(): Promise<PublicSim | null> {
  try {
    const { product } = await getStorefrontCheckout();
    if (!product || !Number.isFinite(product.price) || product.price <= 0) return null;
    return { price: product.price, canOrder: product.available };
  } catch {
    return null;
  }
}
