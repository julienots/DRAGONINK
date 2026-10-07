import type { PurchaseReceipt } from '../systems/meta';
import { IAP } from '../data/progression';

// Abstraction du magasin d'achats intégrés.
//  - AndroidStore : Google Play Billing via le pont natif (window.XalaNative)
//  - MockStore    : magasin de test local (navigateur / développement)
//
// Flux robuste (pas de double récompense, pas d'achat perdu) :
//   1. purchase()            → reçu
//   2. game.act('iap.grant') → récompense + numéro de commande enregistré
//   3. sauvegarde immédiate
//   4. acknowledge()/consume() seulement après la sauvegarde
// Au démarrage, pendingPurchases() renvoie les achats non confirmés, qui sont
// réappliqués (dédupliqués par numéro de commande) puis confirmés.
// Dans une version en ligne, l'étape 2 passe par le serveur qui vérifie la
// signature Google Play avant d'accorder quoi que ce soit.

export type StoreErrorCode = 'cancelled' | 'pending' | 'unavailable' | 'network' | 'already_owned' | 'unknown';

export class StoreError extends Error {
  constructor(public code: StoreErrorCode, message: string) { super(message); }
}

export interface StoreProduct { sku: string; price: string }

export interface StoreProvider {
  readonly name: string;
  readonly isTest: boolean;
  init(): Promise<void>;
  products(): Promise<StoreProduct[]>;
  purchase(sku: string): Promise<PurchaseReceipt>;
  /** confirme (non consommable) ou consomme (consommable) l'achat */
  finish(receipt: PurchaseReceipt, consumable: boolean): Promise<void>;
  /** achats en attente de confirmation (crash entre paiement et récompense) */
  pendingPurchases(): Promise<PurchaseReceipt[]>;
  /** achats non consommables possédés (restauration) */
  owned(): Promise<PurchaseReceipt[]>;
}

const MOCK_KEY = 'xalamonsters.mockstore';

interface MockDb { owned: PurchaseReceipt[]; pending: PurchaseReceipt[] }

export class MockStore implements StoreProvider {
  readonly name = 'Magasin de test';
  readonly isTest = true;
  /** confirmation affichée par l'interface ("payer 4,99 € ?") */
  confirm: (sku: string) => Promise<boolean> = async () => true;

  private db(): MockDb {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY) ?? '') as MockDb; } catch { return { owned: [], pending: [] }; }
  }
  private save(d: MockDb): void { try { localStorage.setItem(MOCK_KEY, JSON.stringify(d)); } catch { /* ignore */ } }

  async init(): Promise<void> {}
  async products(): Promise<StoreProduct[]> {
    return Object.values(IAP).map((p) => ({ sku: p.sku, price: p.price }));
  }
  async purchase(sku: string): Promise<PurchaseReceipt> {
    const p = IAP[sku];
    if (!p) throw new StoreError('unavailable', 'Produit indisponible');
    const d = this.db();
    if (p.type === 'non_consumable' && sku !== 'xala_pass_premium' && d.owned.some((o) => o.sku === sku)) throw new StoreError('already_owned', 'Déjà acheté : utilise « Restaurer les achats ».');
    const ok = await this.confirm(sku);
    if (!ok) throw new StoreError('cancelled', 'Achat annulé');
    await new Promise((r) => setTimeout(r, 500));
    const rc: PurchaseReceipt = { orderId: `MOCK.${Date.now()}.${Math.floor(Math.random() * 1e9)}`, sku, purchaseToken: `tok_${Math.random().toString(36).slice(2)}`, purchaseTime: Date.now(), source: 'mock' };
    d.pending.push(rc);
    this.save(d);
    return rc;
  }
  async finish(rc: PurchaseReceipt, consumable: boolean): Promise<void> {
    const d = this.db();
    d.pending = d.pending.filter((x) => x.orderId !== rc.orderId);
    if (!consumable && !d.owned.some((o) => o.orderId === rc.orderId)) d.owned.push(rc);
    this.save(d);
  }
  async pendingPurchases(): Promise<PurchaseReceipt[]> { return this.db().pending; }
  async owned(): Promise<PurchaseReceipt[]> { return this.db().owned; }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> };

declare global {
  interface Window { __xalaBilling?: (id: string, ok: boolean, payload: string) => void }
}

export class AndroidStore implements StoreProvider {
  readonly name = 'Google Play';
  readonly isTest = false;
  private calls = new Map<string, Pending>();
  private seq = 0;

  constructor() {
    window.__xalaBilling = (id, ok, payload) => {
      const p = this.calls.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      this.calls.delete(id);
      let data: unknown = payload;
      try { data = JSON.parse(payload); } catch { /* texte brut */ }
      if (ok) p.resolve(data);
      else {
        const e = data as { code?: StoreErrorCode; message?: string };
        p.reject(new StoreError(e?.code ?? 'unknown', e?.message ?? 'Erreur du magasin'));
      }
    };
  }

  static available(): boolean {
    try {
      const n = typeof window !== 'undefined' ? window.XalaNative : undefined;
      return typeof n?.billingCall === 'function' && typeof n.billingAvailable === 'function' && !!(n.billingAvailable as () => boolean)();
    } catch {
      return false;
    }
  }

  private call<T>(method: string, arg: unknown, timeoutMs = 120000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `c${++this.seq}`;
      const timer = setTimeout(() => { this.calls.delete(id); reject(new StoreError('network', 'Le magasin ne répond pas')); }, timeoutMs);
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        (window.XalaNative!.billingCall as (id: string, m: string, a: string) => void)(id, method, JSON.stringify(arg ?? null));
      } catch (e) {
        clearTimeout(timer);
        this.calls.delete(id);
        reject(new StoreError('unavailable', String(e)));
      }
    });
  }

  init(): Promise<void> { return this.call('init', null, 20000); }
  products(): Promise<StoreProduct[]> { return this.call('products', Object.keys(IAP), 20000); }
  purchase(sku: string): Promise<PurchaseReceipt> {
    const consumable = IAP[sku]?.type === 'consumable';
    return this.call<PurchaseReceipt>('purchase', { sku, consumable }).then((r) => ({ ...r, source: 'play' as const }));
  }
  finish(rc: PurchaseReceipt, consumable: boolean): Promise<void> { return this.call('finish', { token: rc.purchaseToken, consumable }, 30000); }
  pendingPurchases(): Promise<PurchaseReceipt[]> { return this.call<PurchaseReceipt[]>('pending', null, 20000).then((l) => l.map((r) => ({ ...r, source: 'play' as const }))); }
  owned(): Promise<PurchaseReceipt[]> { return this.call<PurchaseReceipt[]>('owned', null, 20000).then((l) => l.map((r) => ({ ...r, source: 'play' as const }))); }
}

export function createStore(): StoreProvider {
  return AndroidStore.available() ? new AndroidStore() : new MockStore();
}
