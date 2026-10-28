/**
 * Talks to apps/api when EXPO_PUBLIC_API_URL is set. Without it (e.g. a quick
 * Expo Go demo) the app runs the same shared engine on the device.
 */
import { CheckoutError, type CheckoutInput, type Order } from '@get/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function postCheckout(input: CheckoutInput): Promise<Order | null> {
  if (!API_URL) return null;
  const res = await fetch(`${API_URL}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lines: input.lines,
      mode: input.mode,
      paymentMethodId: input.paymentMethod.id,
      deliverTo: input.deliverTo,
      etaMinutes: input.etaMinutes,
    }),
  }).catch(() => null);
  if (!res) return null; // API unreachable: fall back to the local simulation
  const body = await res.json();
  // cards added on the device are not known to the demo API; simulate those locally
  if (!res.ok && body.error === 'unknown_payment_method') return null;
  if (!res.ok) throw new CheckoutError(body.error, body.message);
  return body as Order;
}
