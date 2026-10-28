/**
 * Simulated world inventory. Nothing here is connected to a real business:
 * stores, prices and stock are generated deterministically so every app
 * (mobile, web, API, Supabase seed) sees the same catalogue.
 */
import { USD_RATES } from './geo';
import type { Mode, Offer, PaymentMethod, Product, SavedLocation, Store } from './types';

type StoreSeed = Omit<Store, 'id' | 'rating' | 'verified' | 'hours' | 'prepMinutes' | 'deliveryRadiusKm' | 'shipsInternational'> &
  Partial<Pick<Store, 'rating' | 'verified' | 'hours' | 'prepMinutes' | 'deliveryRadiusKm' | 'shipsInternational'>> & {
    carries: string[];
    /** multiplier over the reference price; >1 is pricier */
    priceFactor: number;
  };

const STORE_SEEDS: StoreSeed[] = [
  // New Haven, CT (the pin on the sketches)
  { name: 'J&B Deli', kind: 'physical', category: 'Deli', address: '1 Whitney Ave', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3105, lng: -72.9257, hasPickup: true, hasDelivery: true, carries: ['food', 'drinks'], priceFactor: 0.95, prepMinutes: 8 },
  { name: 'Chapel & West Wine and Spirits', kind: 'physical', category: 'Liquor store', address: '1104 Chapel St', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3075, lng: -72.9351, hasPickup: true, hasDelivery: false, carries: ['alcohol', 'drinks'], priceFactor: 1.0, prepMinutes: 5 },
  { name: 'Mansion del Lunch', kind: 'physical', category: 'Restaurant', address: '245 Crown St', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3062, lng: -72.9289, hasPickup: true, hasDelivery: true, carries: ['food', 'drinks'], priceFactor: 1.1, prepMinutes: 15 },
  { name: 'Starbucks Chapel St', kind: 'physical', category: 'Coffee', address: '1068 Chapel St', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3079, lng: -72.9332, hasPickup: true, hasDelivery: true, carries: ['coffee', 'drinks'], priceFactor: 1.05, prepMinutes: 6 },
  { name: 'CVS Pharmacy', kind: 'physical', category: 'Pharmacy', address: '27 Broadway', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3113, lng: -72.9312, hasPickup: true, hasDelivery: true, carries: ['pharmacy', 'drinks', 'home'], priceFactor: 1.08, prepMinutes: 10 },
  { name: 'Dick’s Sporting Goods', kind: 'physical', category: 'Sports', address: '1201 Boston Post Rd, Milford', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.2337, lng: -73.0302, hasPickup: true, hasDelivery: true, carries: ['sports', 'fashion'], priceFactor: 0.97, deliveryRadiusKm: 25 },
  { name: 'Best Buy Milford', kind: 'physical', category: 'Electronics', address: '1328 Boston Post Rd, Milford', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.2405, lng: -73.0218, hasPickup: true, hasDelivery: true, carries: ['electronics'], priceFactor: 1.0, deliveryRadiusKm: 25 },
  { name: 'Home Depot', kind: 'physical', category: 'Home improvement', address: '600 Connecticut Ave, Norwalk', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.2985, lng: -72.9123, hasPickup: true, hasDelivery: true, carries: ['home', 'bbq', 'service-home'], priceFactor: 0.93, deliveryRadiusKm: 30 },
  { name: 'Stop & Shop', kind: 'physical', category: 'Grocery', address: '150 Whalley Ave', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3149, lng: -72.9406, hasPickup: true, hasDelivery: true, carries: ['food', 'drinks', 'meat', 'bbq', 'alcohol', 'pharmacy'], priceFactor: 0.9, prepMinutes: 20 },
  { name: 'Barber on Broadway', kind: 'physical', category: 'Barber', address: '70 Broadway', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3118, lng: -72.9302, hasPickup: false, hasDelivery: false, carries: ['service-beauty'], priceFactor: 1.0 },
  { name: 'Yale Health Walk-in', kind: 'physical', category: 'Clinic', address: '55 Lock St', city: 'New Haven', country: 'US', currency: 'USD', lat: 41.3155, lng: -72.9248, hasPickup: false, hasDelivery: false, carries: ['service-health'], priceFactor: 1.0 },

  // New York
  { name: 'Apple Fifth Avenue', kind: 'physical', category: 'Electronics', address: '767 5th Ave', city: 'New York', country: 'US', currency: 'USD', lat: 40.7638, lng: -73.9729, hasPickup: true, hasDelivery: true, carries: ['electronics'], priceFactor: 1.04, deliveryRadiusKm: 20 },
  { name: 'B&H Photo', kind: 'physical', category: 'Electronics', address: '420 9th Ave', city: 'New York', country: 'US', currency: 'USD', lat: 40.7533, lng: -73.9967, hasPickup: true, hasDelivery: true, carries: ['electronics'], priceFactor: 0.92, deliveryRadiusKm: 20, shipsInternational: true },
  { name: 'Target Herald Square', kind: 'physical', category: 'Department store', address: '112 W 34th St', city: 'New York', country: 'US', currency: 'USD', lat: 40.7502, lng: -73.9884, hasPickup: true, hasDelivery: true, carries: ['home', 'fashion', 'pharmacy', 'drinks', 'electronics', 'sports', 'bbq', 'books'], priceFactor: 0.96 },
  { name: 'Whole Foods Bryant Park', kind: 'physical', category: 'Grocery', address: '1095 6th Ave', city: 'New York', country: 'US', currency: 'USD', lat: 40.7545, lng: -73.9845, hasPickup: true, hasDelivery: true, carries: ['meat', 'food', 'drinks', 'coffee', 'bbq'], priceFactor: 1.12 },

  // Mexico City
  { name: 'Starbucks Polanco', kind: 'physical', category: 'Coffee', address: 'Av. Presidente Masaryk 360', city: 'Ciudad de México', country: 'MX', currency: 'MXN', lat: 19.4318, lng: -99.1966, hasPickup: true, hasDelivery: true, carries: ['coffee', 'drinks', 'food'], priceFactor: 0.8 },
  { name: 'OXXO Reforma', kind: 'physical', category: 'Convenience', address: 'Paseo de la Reforma 222', city: 'Ciudad de México', country: 'MX', currency: 'MXN', lat: 19.4285, lng: -99.1617, hasPickup: true, hasDelivery: true, carries: ['drinks', 'alcohol', 'pharmacy', 'food'], priceFactor: 0.7, prepMinutes: 4 },
  { name: 'Liverpool Polanco', kind: 'physical', category: 'Department store', address: 'Mariano Escobedo 425', city: 'Ciudad de México', country: 'MX', currency: 'MXN', lat: 19.4339, lng: -99.1823, hasPickup: true, hasDelivery: true, carries: ['fashion', 'electronics', 'home', 'sports', 'books'], priceFactor: 1.1, deliveryRadiusKm: 25 },
  { name: 'Walmart Express Condesa', kind: 'physical', category: 'Grocery', address: 'Av. Michoacán 30', city: 'Ciudad de México', country: 'MX', currency: 'MXN', lat: 19.4115, lng: -99.1699, hasPickup: true, hasDelivery: true, carries: ['meat', 'food', 'drinks', 'alcohol', 'bbq', 'home'], priceFactor: 0.75 },

  // Madrid
  { name: 'El Corte Inglés Castellana', kind: 'physical', category: 'Department store', address: 'Paseo de la Castellana 85', city: 'Madrid', country: 'ES', currency: 'EUR', lat: 40.4475, lng: -3.6919, hasPickup: true, hasDelivery: true, carries: ['meat', 'fashion', 'electronics', 'home', 'books', 'food', 'alcohol'], priceFactor: 1.05, deliveryRadiusKm: 25, shipsInternational: true },
  { name: 'MediaMarkt Madrid', kind: 'physical', category: 'Electronics', address: 'Calle de Alcalá 237', city: 'Madrid', country: 'ES', currency: 'EUR', lat: 40.4319, lng: -3.6576, hasPickup: true, hasDelivery: true, carries: ['electronics'], priceFactor: 0.94 },

  // London
  { name: 'Selfridges', kind: 'physical', category: 'Department store', address: '400 Oxford St', city: 'London', country: 'GB', currency: 'GBP', lat: 51.5144, lng: -0.1527, hasPickup: true, hasDelivery: true, carries: ['fashion', 'electronics', 'home', 'food', 'alcohol'], priceFactor: 1.2, shipsInternational: true },
  { name: 'Tesco Express Soho', kind: 'physical', category: 'Grocery', address: '22 Old Compton St', city: 'London', country: 'GB', currency: 'GBP', lat: 51.5132, lng: -0.1306, hasPickup: true, hasDelivery: true, carries: ['meat', 'food', 'drinks', 'alcohol', 'pharmacy'], priceFactor: 0.9 },

  // Tokyo
  { name: 'Bic Camera Yurakucho', kind: 'physical', category: 'Electronics', address: '1-11-1 Yurakucho, Chiyoda', city: 'Tokyo', country: 'JP', currency: 'JPY', lat: 35.6749, lng: 139.7630, hasPickup: true, hasDelivery: true, carries: ['electronics'], priceFactor: 0.85, shipsInternational: true },
  { name: 'Uniqlo Ginza', kind: 'physical', category: 'Fashion', address: '6-9-5 Ginza, Chuo', city: 'Tokyo', country: 'JP', currency: 'JPY', lat: 35.6706, lng: 139.7649, hasPickup: true, hasDelivery: true, carries: ['fashion'], priceFactor: 0.8, shipsInternational: true },

  // Online only
  { name: 'Amazon', kind: 'online', category: 'Marketplace', address: 'Online', city: 'Seattle', country: 'US', currency: 'USD', lat: 47.6062, lng: -122.3321, hasPickup: false, hasDelivery: true, carries: ['electronics', 'sports', 'home', 'books', 'fashion', 'pharmacy', 'bbq'], priceFactor: 0.9, shipsInternational: true, deliveryRadiusKm: 0, verified: true },
  { name: 'AliExpress', kind: 'online', category: 'Marketplace', address: 'Online', city: 'Hangzhou', country: 'CN', currency: 'USD', lat: 30.2741, lng: 120.1551, hasPickup: false, hasDelivery: true, carries: ['electronics', 'sports', 'home', 'fashion', 'bbq'], priceFactor: 0.62, shipsInternational: true, deliveryRadiusKm: 0, verified: false },
];

type ProductSeed = Omit<Product, 'id' | 'requirements' | 'isService' | 'tags'> &
  Partial<Pick<Product, 'requirements' | 'isService'>> & { tags: string };

const PRODUCT_SEEDS: ProductSeed[] = [
  // food & drinks
  { name: 'Croissant con pechuga y queso', brand: 'Starbucks', category: 'coffee', description: 'Butter croissant with turkey breast and cheese.', tags: 'croissant sandwich breakfast turkey ham cheese', glyph: '🥐', basePriceUSD: 4.75 },
  { name: 'Caffè Latte (grande)', brand: 'Starbucks', category: 'coffee', description: 'Espresso with steamed milk, 16 oz.', tags: 'coffee latte espresso cafe', glyph: '☕', basePriceUSD: 5.25 },
  { name: 'Chicken salad', brand: 'House', category: 'food', description: 'Grilled chicken, romaine, tomato, house dressing.', tags: 'salad chicken lunch healthy', glyph: '🥗', basePriceUSD: 12.0 },
  { name: 'Lunch combo', brand: 'House', category: 'food', description: 'Sandwich, side and a drink.', tags: 'lunch combo sandwich meal', glyph: '🍱', basePriceUSD: 13.0 },
  { name: 'Turkey club sandwich', brand: 'House', category: 'food', description: 'Turkey, bacon, lettuce, tomato on toasted bread.', tags: 'sandwich turkey club lunch', glyph: '🥪', basePriceUSD: 10.5 },
  { name: 'Saratoga Sparkling Water 28 oz', brand: 'Saratoga', category: 'drinks', description: 'Sparkling spring water in a glass bottle.', tags: 'water sparkling mineral bottle', glyph: '💧', basePriceUSD: 3.24 },
  { name: 'Evian Natural Spring Water 500 mL', brand: 'Evian', category: 'drinks', description: 'Still natural spring water.', tags: 'water still bottle evian', glyph: '💧', basePriceUSD: 2.29 },
  { name: 'Coca-Cola 600 mL', brand: 'Coca-Cola', category: 'drinks', description: 'Classic Coca-Cola, 600 mL bottle.', tags: 'soda coke cola soft drink', glyph: '🥤', basePriceUSD: 2.1 },
  { name: 'Bacardí Superior Rum 750 mL', brand: 'Bacardí', category: 'alcohol', description: 'White rum, 40% ABV.', tags: 'rum bacardi alcohol liquor bottle party', glyph: '🍾', basePriceUSD: 22.0, requirements: ['ID required (21+)'] },
  { name: 'Corona Extra 6-pack', brand: 'Corona', category: 'alcohol', description: 'Six 355 mL bottles.', tags: 'beer corona six pack alcohol bbq party', glyph: '🍺', basePriceUSD: 11.5, requirements: ['ID required (21+)'] },
  { name: 'Ribeye steak 500 g', brand: 'Butcher', category: 'meat', description: 'Fresh ribeye, about 1.1 lb.', tags: 'steak beef ribeye bbq carne asada meat grill', glyph: '🥩', basePriceUSD: 16.0 },
  { name: 'Hardwood lump charcoal 4 kg', brand: 'Royal Oak', category: 'bbq', description: 'Natural lump charcoal for grilling.', tags: 'charcoal bbq grill carne asada coal', glyph: '🔥', basePriceUSD: 14.0 },
  { name: 'Portable kettle grill 18 in', brand: 'Weber', category: 'bbq', description: '18-inch charcoal kettle grill.', tags: 'grill bbq kettle charcoal carne asada barbecue', glyph: '🍖', basePriceUSD: 109.0 },

  // electronics
  { name: 'AirPods Pro (2nd generation)', brand: 'Apple', category: 'electronics', description: 'Active noise cancelling earbuds, USB-C case.', tags: 'airpods earbuds headphones apple wireless', glyph: '🎧', basePriceUSD: 249.0 },
  { name: 'Sony WH-1000XM5', brand: 'Sony', category: 'electronics', description: 'Over-ear wireless noise cancelling headphones.', tags: 'headphones sony wireless noise cancelling', glyph: '🎧', basePriceUSD: 399.0 },
  { name: 'Kindle Paperwhite 16 GB', brand: 'Amazon', category: 'electronics', description: '7-inch glare-free e-reader.', tags: 'kindle ereader e-reader books tablet', glyph: '📖', basePriceUSD: 159.0 },
  { name: 'iPhone 17 128 GB', brand: 'Apple', category: 'electronics', description: 'Apple iPhone 17, 128 GB, unlocked.', tags: 'iphone phone smartphone apple mobile', glyph: '📱', basePriceUSD: 799.0 },
  { name: 'Nintendo Switch 2', brand: 'Nintendo', category: 'electronics', description: 'Hybrid home and handheld console.', tags: 'nintendo switch console games gaming', glyph: '🎮', basePriceUSD: 449.0 },
  { name: 'USB-C to USB-C cable 1 m', brand: 'Anker', category: 'electronics', description: '100 W braided charging cable.', tags: 'cable usb-c charger charging cord', glyph: '🔌', basePriceUSD: 12.99 },
  { name: '20 W USB-C power adapter', brand: 'Apple', category: 'electronics', description: 'Fast charging wall adapter.', tags: 'charger adapter usb-c power plug', glyph: '🔌', basePriceUSD: 19.0 },

  // sports
  { name: 'Wooden baseball bat 33 in', brand: 'Louisville Slugger', category: 'sports', description: 'Maple wood bat, 33 in, 30 oz.', tags: 'baseball bat wooden wood maple 33', glyph: '⚾', basePriceUSD: 89.0 },
  { name: 'Metal baseball bat 32 in', brand: 'Easton', category: 'sports', description: 'Aluminium alloy bat, 32 in, 29 oz.', tags: 'baseball bat metal aluminium aluminum alloy 32', glyph: '⚾', basePriceUSD: 69.0 },
  { name: 'Official baseball (12-pack)', brand: 'Rawlings', category: 'sports', description: 'Leather baseballs, 12 count.', tags: 'baseball ball balls rawlings', glyph: '⚾', basePriceUSD: 54.0 },
  { name: 'Soccer ball size 5', brand: 'Adidas', category: 'sports', description: 'Match ball, size 5.', tags: 'soccer football ball futbol', glyph: '⚽', basePriceUSD: 35.0 },

  // home
  { name: 'Blackboard 60×90 cm (screw mount)', brand: 'Quartet', category: 'home', description: 'Wood-framed chalkboard; screws and wall anchors included.', tags: 'blackboard chalkboard board screwing screws wall mount', glyph: '⬛', basePriceUSD: 45.0 },
  { name: 'Blackboard 60×90 cm (adhesive)', brand: 'Quartet', category: 'home', description: 'Frameless chalkboard sheet with adhesive back.', tags: 'blackboard chalkboard board adhesive sticker wall', glyph: '⬛', basePriceUSD: 29.0 },
  { name: 'Cordless drill 20 V', brand: 'DeWalt', category: 'home', description: 'Drill/driver kit with two batteries.', tags: 'drill tool cordless screwdriver dewalt', glyph: '🛠', basePriceUSD: 139.0 },
  { name: 'Silk bed sheet set (queen)', brand: 'Lilysilk', category: 'home', description: '100% mulberry silk, 19 momme.', tags: 'sheets bed silk bedding queen', glyph: '🛏', basePriceUSD: 299.0 },
  { name: 'Umbrella (compact)', brand: 'Totes', category: 'home', description: 'Auto open/close travel umbrella.', tags: 'umbrella rain compact', glyph: '☂', basePriceUSD: 24.0 },

  // fashion
  { name: 'Supima cotton crew-neck T-shirt', brand: 'Uniqlo', category: 'fashion', description: 'White, regular fit.', tags: 'tshirt t-shirt shirt white cotton tee', glyph: '👕', basePriceUSD: 19.9 },
  { name: '501 Original jeans', brand: "Levi's", category: 'fashion', description: 'Straight fit, medium stonewash.', tags: 'jeans denim levis pants 501', glyph: '👖', basePriceUSD: 79.5 },
  { name: 'Air Force 1 ’07', brand: 'Nike', category: 'fashion', description: 'White leather sneakers.', tags: 'sneakers shoes nike air force white', glyph: '👟', basePriceUSD: 115.0 },

  // pharmacy
  { name: 'Ibuprofen 200 mg (24 ct)', brand: 'Advil', category: 'pharmacy', description: 'Pain reliever / fever reducer.', tags: 'ibuprofen advil pain medicine headache', glyph: '💊', basePriceUSD: 8.49 },
  { name: 'Sunscreen SPF 50, 200 mL', brand: 'La Roche-Posay', category: 'pharmacy', description: 'Broad spectrum, water resistant.', tags: 'sunscreen sun spf protection beach', glyph: '🧴', basePriceUSD: 29.99 },

  // books
  { name: 'Atomic Habits', brand: 'James Clear', category: 'books', description: 'Paperback.', tags: 'book books habits self-help', glyph: '📕', basePriceUSD: 18.0 },

  // services (reservations & appointments)
  { name: 'Haircut', brand: 'Barber', category: 'service-beauty', description: '30-minute haircut, by appointment.', tags: 'haircut barber hair cut appointment', glyph: '✂', basePriceUSD: 35.0, isService: true },
  { name: 'Plumber visit (diagnosis)', brand: 'Pro Services', category: 'service-home', description: 'In-home visit to diagnose a plumbing issue.', tags: 'plumber plumbing leak repair visit appointment', glyph: '🔧', basePriceUSD: 89.0, isService: true },
  { name: 'Door repair visit', brand: 'Pro Services', category: 'service-home', description: 'Handyman visit for a broken door.', tags: 'door repair handyman broken visit appointment', glyph: '🚪', basePriceUSD: 95.0, isService: true },
  { name: 'General practitioner consult', brand: 'Clinic', category: 'service-health', description: '20-minute walk-in or scheduled consult.', tags: 'doctor medical consult appointment clinic', glyph: '🩺', basePriceUSD: 120.0, isService: true },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Small deterministic PRNG so the catalogue is identical on every run. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function roundPrice(amount: number, currency: Store['currency']): number {
  if (currency === 'JPY') return Math.round(amount / 10) * 10;
  if (currency === 'MXN') return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export const STORES: Store[] = STORE_SEEDS.map(({ carries: _c, priceFactor: _p, ...s }) => ({
  rating: Math.round((3.8 + hash(s.name) * 1.2) * 10) / 10,
  verified: hash(s.name + 'v') > 0.3,
  hours: s.kind === 'online' ? 'Always open' : '08:00–22:00',
  prepMinutes: 12,
  deliveryRadiusKm: 12,
  shipsInternational: false,
  ...s,
  id: `store_${slug(s.name)}`,
}));

export const PRODUCTS: Product[] = PRODUCT_SEEDS.map((p) => ({
  requirements: [],
  isService: false,
  ...p,
  tags: p.tags.split(' '),
  id: `prod_${slug(p.brand + ' ' + p.name)}`,
}));

function buildOffers(): Offer[] {
  const offers: Offer[] = [];
  STORE_SEEDS.forEach((seed, si) => {
    const store = STORES[si];
    for (const product of PRODUCTS) {
      if (!seed.carries.includes(product.category)) continue;
      const key = store.id + product.id;
      // Branded coffee items only at that brand; each store skips ~15% of its range.
      if (product.category === 'coffee' && product.brand === 'Starbucks' && !store.name.startsWith('Starbucks') && hash(key) > 0.35) continue;
      if (hash(key + 'skip') < 0.15) continue;
      const jitter = 0.9 + hash(key + 'price') * 0.2;
      const priceUSD = product.basePriceUSD * seed.priceFactor * jitter;
      const modes: Mode[] = [];
      if (store.kind === 'physical') modes.push('in_store');
      if (store.hasPickup && !product.isService) modes.push('pickup');
      if (store.hasDelivery && !product.isService && hash(key + 'd') > 0.12) modes.push('delivery');
      if (modes.length === 0) continue;
      const feeUSD = store.kind === 'online' ? (priceUSD > 35 ? 0 : 5.99) : 2.99 + hash(key + 'fee') * 3;
      offers.push({
        id: `offer_${store.id.slice('store_'.length)}__${product.id.slice('prod_'.length)}`,
        productId: product.id,
        storeId: store.id,
        price: roundPrice(priceUSD * USD_RATES[store.currency], store.currency),
        stock: product.isService ? 8 : Math.floor(hash(key + 'stock') * 60),
        inventoryVerified: hash(key + 'iv') > 0.4,
        modes,
        deliveryFee: modes.includes('delivery') ? roundPrice(feeUSD * USD_RATES[store.currency], store.currency) : 0,
      });
    }
  });
  return offers;
}

export const OFFERS: Offer[] = buildOffers();

/** Locations for the Location Interface strip (LI 1). "Here" is replaced by GPS when available. */
export const DEFAULT_LOCATIONS: SavedLocation[] = [
  { id: 'loc_here', label: 'Here', icon: 'here', address: 'Chapel St, New Haven, CT', lat: 41.3083, lng: -72.9279 },
  { id: 'loc_home', label: 'Home', icon: 'home', address: '120 Howe St, New Haven, CT', lat: 41.3066, lng: -72.9365, buildingType: 'Apartment' },
  { id: 'loc_work', label: 'Work', icon: 'work', address: '1 Hillhouse Ave, New Haven, CT', lat: 41.3127, lng: -72.9224, buildingType: 'Office' },
  { id: 'loc_cdmx', label: 'CDMX', icon: 'pin', address: 'Polanco, Ciudad de México', lat: 19.4326, lng: -99.1937, buildingType: 'Hotel' },
];

/** Fake payment methods. Any Luhn-valid number works; see checkout.ts for test cards. */
export const DEMO_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm_visa', kind: 'card', brand: 'Visa', last4: '4242', label: 'Visa ••••4242', expMonth: 12, expYear: 2030 },
  { id: 'pm_mc', kind: 'card', brand: 'Mastercard', last4: '4444', label: 'Mastercard ••••4444', expMonth: 8, expYear: 2029 },
  { id: 'pm_getcash', kind: 'get_cash', brand: 'GET Cash', last4: '', label: 'GET Cash' },
];

export const DEMO_GET_CASH_USD = 150;

export const storeById = new Map(STORES.map((s) => [s.id, s]));
export const productById = new Map(PRODUCTS.map((p) => [p.id, p]));
