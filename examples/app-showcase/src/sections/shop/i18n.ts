import { createI18n } from '@pyreon/i18n'
import type { Locale } from './data/types'

/**
 * Shop section i18n instance.
 *
 * Three fully-translated locales (English, German, French) covering:
 *   • UI chrome — header, cart, buttons, empty state
 *   • Category names (one entry per `Category` enum value)
 *   • Product titles + descriptions (keyed by product id)
 *   • Pluralization for the cart line count (`items_one` / `items_other`)
 *
 * Adding a fourth locale is just one more entry on the `messages`
 * object — every consumer reads `i18n.t(...)` reactively, so the
 * locale switch propagates everywhere on a single signal write.
 */

const en = {
  shop: {
    title: 'Pyreon Store',
    tagline: 'A self-contained i18n + cart demo. Switch locale or currency above.',
    addToCart: 'Add to cart',
    viewCart: 'View cart',
    cartEmpty: 'Your cart is empty.',
    cartTitle: 'Cart',
    checkout: 'Checkout',
    subtotal: 'Subtotal',
    items_one: '{{count}} item',
    items_other: '{{count}} items',
    remove: 'Remove',
    quantity: 'Qty',
    closeCart: 'Close',
    filterAll: 'All categories',
  },
  category: {
    apparel: 'Apparel',
    home: 'Home',
    tech: 'Tech',
    books: 'Books',
  },
  product: {
    'tshirt-classic.title': 'Classic Tee',
    'tshirt-classic.desc': '100% cotton crew-neck. Soft, breathable, fits true to size.',
    'hoodie-zip.title': 'Zip-Up Hoodie',
    'hoodie-zip.desc': 'Brushed-fleece interior with kangaroo pockets and side seams.',
    'sneakers-runner.title': 'Runner Sneakers',
    'sneakers-runner.desc': 'Lightweight mesh upper with cushioned EVA midsole.',
    'cap-curved.title': 'Curved-Brim Cap',
    'cap-curved.desc': 'Six-panel structured cap with adjustable strapback.',
    'mug-ceramic.title': 'Ceramic Mug',
    'mug-ceramic.desc': '12oz hand-thrown ceramic mug. Dishwasher safe.',
    'plant-pot.title': 'Terracotta Planter',
    'plant-pot.desc': 'Drainage hole + saucer. Fits a 6-inch nursery pot.',
    'lamp-desk.title': 'Articulated Desk Lamp',
    'lamp-desk.desc': 'Brass-finish arm with warm-white LED bulb included.',
    'headphones-over.title': 'Over-Ear Headphones',
    'headphones-over.desc': 'Active noise-cancelling, 30-hour battery, USB-C charging.',
    'keyboard-mech.title': 'Mechanical Keyboard',
    'keyboard-mech.desc': 'Hot-swap switches, USB-C, RGB backlight, ANSI layout.',
    'webcam-hd.title': '1080p Webcam',
    'webcam-hd.desc': 'Auto-focus glass lens with built-in mic and privacy shutter.',
    'novel-paperback.title': 'The Long Way Home',
    'novel-paperback.desc': 'A literary novel about migration, memory, and family.',
    'cookbook-hardcover.title': 'Slow Pantry Cooking',
    'cookbook-hardcover.desc': '120 weeknight recipes built around a stocked pantry.',
  },
}

const de = {
  shop: {
    title: 'Pyreon Store',
    tagline: 'Eine in sich geschlossene i18n + Warenkorb Demo. Ändere oben Sprache oder Währung.',
    addToCart: 'In den Warenkorb',
    viewCart: 'Warenkorb ansehen',
    cartEmpty: 'Dein Warenkorb ist leer.',
    cartTitle: 'Warenkorb',
    checkout: 'Zur Kasse',
    subtotal: 'Zwischensumme',
    items_one: '{{count}} Artikel',
    items_other: '{{count}} Artikel',
    remove: 'Entfernen',
    quantity: 'Menge',
    closeCart: 'Schließen',
    filterAll: 'Alle Kategorien',
  },
  category: {
    apparel: 'Bekleidung',
    home: 'Wohnen',
    tech: 'Technik',
    books: 'Bücher',
  },
  product: {
    'tshirt-classic.title': 'Klassisches T-Shirt',
    'tshirt-classic.desc': '100% Baumwolle, Rundhalsausschnitt. Weich, atmungsaktiv, passgenau.',
    'hoodie-zip.title': 'Reißverschluss-Hoodie',
    'hoodie-zip.desc': 'Gebürstetes Fleece-Innenfutter mit Känguru-Taschen.',
    'sneakers-runner.title': 'Runner Sneakers',
    'sneakers-runner.desc': 'Leichtes Mesh-Obermaterial mit gepolsterter EVA-Sohle.',
    'cap-curved.title': 'Cap mit gebogenem Schirm',
    'cap-curved.desc': 'Sechseckige strukturierte Cap mit verstellbarem Strapback.',
    'mug-ceramic.title': 'Keramiktasse',
    'mug-ceramic.desc': '350ml handgefertigte Keramiktasse. Spülmaschinenfest.',
    'plant-pot.title': 'Terracotta-Pflanztopf',
    'plant-pot.desc': 'Mit Abflussloch und Untersetzer. Passend für 15cm Töpfe.',
    'lamp-desk.title': 'Schwenkbare Schreibtischlampe',
    'lamp-desk.desc': 'Messing-Finish-Arm mit warmweißer LED-Birne.',
    'headphones-over.title': 'Over-Ear Kopfhörer',
    'headphones-over.desc': 'Aktive Geräuschunterdrückung, 30 Stunden Akku, USB-C.',
    'keyboard-mech.title': 'Mechanische Tastatur',
    'keyboard-mech.desc': 'Hot-Swap-Schalter, USB-C, RGB-Beleuchtung, ANSI-Layout.',
    'webcam-hd.title': '1080p Webcam',
    'webcam-hd.desc': 'Autofokus mit Glasoptik, Mikrofon und Sichtschutzblende.',
    'novel-paperback.title': 'Der lange Weg nach Hause',
    'novel-paperback.desc': 'Ein literarischer Roman über Migration und Erinnerung.',
    'cookbook-hardcover.title': 'Langsame Vorratsküche',
    'cookbook-hardcover.desc': '120 Alltagsrezepte rund um einen gut gefüllten Vorratsschrank.',
  },
}

const fr = {
  shop: {
    title: 'Pyreon Store',
    tagline: 'Une démo i18n + panier autonome. Changez la langue ou la devise ci-dessus.',
    addToCart: 'Ajouter au panier',
    viewCart: 'Voir le panier',
    cartEmpty: 'Votre panier est vide.',
    cartTitle: 'Panier',
    checkout: 'Commander',
    subtotal: 'Sous-total',
    items_one: '{{count}} article',
    items_other: '{{count}} articles',
    remove: 'Retirer',
    quantity: 'Qté',
    closeCart: 'Fermer',
    filterAll: 'Toutes les catégories',
  },
  category: {
    apparel: 'Vêtements',
    home: 'Maison',
    tech: 'Tech',
    books: 'Livres',
  },
  product: {
    'tshirt-classic.title': 'T-shirt classique',
    'tshirt-classic.desc': '100 % coton, col rond. Doux, respirant, taille standard.',
    'hoodie-zip.title': 'Sweat à capuche zippé',
    'hoodie-zip.desc': 'Intérieur en polaire brossée avec poches kangourou.',
    'sneakers-runner.title': 'Baskets Runner',
    'sneakers-runner.desc': 'Tige en mesh légère avec semelle intermédiaire EVA.',
    'cap-curved.title': 'Casquette à visière courbée',
    'cap-curved.desc': 'Casquette structurée six pans, fermeture ajustable.',
    'mug-ceramic.title': 'Mug en céramique',
    'mug-ceramic.desc': 'Mug en céramique tourné main 350 ml. Lave-vaisselle.',
    'plant-pot.title': 'Pot en terre cuite',
    'plant-pot.desc': 'Avec trou de drainage et soucoupe. Pour pot de 15 cm.',
    'lamp-desk.title': 'Lampe de bureau articulée',
    'lamp-desk.desc': 'Bras finition laiton avec ampoule LED blanc chaud incluse.',
    'headphones-over.title': 'Casque circum-aural',
    'headphones-over.desc': 'Réduction de bruit active, 30 h d\'autonomie, USB-C.',
    'keyboard-mech.title': 'Clavier mécanique',
    'keyboard-mech.desc': 'Switches hot-swap, USB-C, rétroéclairage RGB, ANSI.',
    'webcam-hd.title': 'Webcam 1080p',
    'webcam-hd.desc': 'Mise au point auto, micro intégré, cache de confidentialité.',
    'novel-paperback.title': 'Le long chemin du retour',
    'novel-paperback.desc': 'Un roman littéraire sur la migration et la mémoire.',
    'cookbook-hardcover.title': 'Cuisine de garde-manger',
    'cookbook-hardcover.desc': '120 recettes du quotidien autour d\'un garde-manger.',
  },
}

/** Singleton i18n instance — created once at module load. */
export const shopI18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en,
    de,
    fr,
  },
})

/** All locales the user can switch between. */
export const LOCALES: Array<{ code: Locale; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

/**
 * Format a price in the selected currency for the active locale.
 *
 * Uses `Intl.NumberFormat` so the displayed digit grouping and
 * decimal separator match the locale convention (`$28.00`, `28,00 €`,
 * `28,00 €` etc.).
 */
export function formatPrice(amountUsd: number, currency: string, locale: string): string {
  const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79 }
  const rate = rates[currency] ?? 1
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountUsd * rate)
}
