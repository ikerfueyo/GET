/**
 * Where the API keeps per-user state (orders, cards, GET Cash).
 * In-memory by default; set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
 * DEMO_USER_ID to also persist simulated orders to Supabase.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEMO_GET_CASH_USD, DEMO_PAYMENT_METHODS, type Order, type PaymentMethod } from '@get/shared';

export interface UserState {
  orders: Order[];
  paymentMethods: PaymentMethod[];
  getCashUSD: number;
}

export function createUserState(): UserState {
  return { orders: [], paymentMethods: [...DEMO_PAYMENT_METHODS], getCashUSD: DEMO_GET_CASH_USD };
}

export class Persistence {
  private db: SupabaseClient | null;
  constructor(
    url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    private userId = process.env.DEMO_USER_ID,
  ) {
    this.db = url && key && userId ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  get enabled() {
    return this.db !== null;
  }

  async saveOrder(order: Order): Promise<void> {
    if (!this.db) return;
    const { data, error } = await this.db
      .from('orders')
      .insert({
        user_id: this.userId,
        store_id: order.storeId,
        mode: order.mode,
        status: order.status,
        currency: order.currency,
        subtotal: order.subtotal,
        fees: order.fees,
        total: order.total,
        deliver_to: order.deliverTo,
        placed_at: order.placedAt,
        eta_at: order.etaAt,
      })
      .select('id')
      .single();
    if (error) throw error;
    const { error: itemsError } = await this.db.from('order_items').insert(
      order.lines.map((l) => ({
        order_id: data.id,
        offer_id: l.offerId,
        product_id: l.productId,
        name: l.name,
        quantity: l.quantity,
        unit_price: l.unitPrice,
      })),
    );
    if (itemsError) throw itemsError;
    await this.db.from('payments').insert({
      order_id: data.id,
      user_id: this.userId,
      amount: order.total,
      currency: order.currency,
    });
  }
}
