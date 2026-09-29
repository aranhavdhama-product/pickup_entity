/**
 * THE sample SKU catalogue — one source for both
 *   - the local SKU master's seed rows (nueva/mastersTree `service_order` → sku), and
 *   - the consignment form's SKU Code picker fallback (growOrders/masters SAMPLE_SKUS),
 * so a SKU seen on the master is the one the form offers, with the same HSN Code and
 * Country of Origin. Pure data, deterministic — no imports, no random.
 *
 * Dimensions are CM and weights KG (the uom fields say so). HSN codes are real 6–8 digit
 * headings for the goods described. ELECTRONICS-003 is staging's own sample row.
 */
export interface SampleSku {
  code: string
  name: string
  description: string
  category: string
  hsnCode: string
  originCountry: string
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  /** unit cost, portal currency */
  unitCost: number
  stackable: boolean
  hubs: string[]
}

export const SAMPLE_SKU_CATALOGUE: SampleSku[] = [
  { code: 'ELECTRONICS-003', name: 'iPhone, blue, 6 GB / 120 GB', description: 'Apple Iphone Blue Colour 6gb Ram 120gb Storage', category: 'Electronics', hsnCode: '851713', originCountry: 'China', lengthCm: 11, widthCm: 3, heightCm: 4, weightKg: 1, unitCost: 54990, stackable: true, hubs: ['ord', 'nyc'] },
  { code: 'SKU-LAPTOP15', name: '15" laptop', description: '15-inch laptop, 16 GB RAM, 512 GB SSD, boxed', category: 'Electronics', hsnCode: '847130', originCountry: 'Taiwan', lengthCm: 40, widthCm: 28, heightCm: 6, weightKg: 2.1, unitCost: 48500, stackable: false, hubs: ['ord'] },
  { code: 'SKU-MONITOR27', name: '27" monitor', description: '27-inch IPS monitor with stand, boxed', category: 'Electronics', hsnCode: '852852', originCountry: 'South Korea', lengthCm: 70, widthCm: 20, heightCm: 50, weightKg: 6.5, unitCost: 16900, stackable: false, hubs: ['nyc'] },
  { code: 'SKU-PHCASE', name: 'Phone case', description: 'Silicone phone case, retail blister', category: 'Accessories', hsnCode: '392690', originCountry: 'China', lengthCm: 16, widthCm: 9, heightCm: 2, weightKg: 0.08, unitCost: 450, stackable: true, hubs: ['ord', 'nyc'] },
  { code: 'SKU-TSHIRT', name: 'T-shirt (packed)', description: 'Cotton crew-neck T-shirt, size M, polybagged', category: 'Apparel', hsnCode: '610910', originCountry: 'Vietnam', lengthCm: 25, widthCm: 20, heightCm: 3, weightKg: 0.25, unitCost: 599, stackable: true, hubs: ['ord'] },
  { code: 'SKU-CHINO32', name: 'Chino trousers, W32', description: "Men's cotton chino trousers, waist 32, folded", category: 'Apparel', hsnCode: '620342', originCountry: 'India', lengthCm: 35, widthCm: 28, heightCm: 4, weightKg: 0.55, unitCost: 1450, stackable: true, hubs: ['nyc'] },
  { code: 'SKU-CHAIR-OFF', name: 'Office chair (flat-pack)', description: 'Swivel office chair with castors, flat-packed carton', category: 'Furniture', hsnCode: '940130', originCountry: 'China', lengthCm: 68, widthCm: 60, heightCm: 35, weightKg: 14.5, unitCost: 7800, stackable: false, hubs: ['ord'] },
  { code: 'SKU-CHAIR-WD', name: 'Dining chair, wooden', description: 'Upholstered wooden-frame dining chair, assembled', category: 'Furniture', hsnCode: '940161', originCountry: 'Philippines', lengthCm: 55, widthCm: 50, heightCm: 95, weightKg: 7.2, unitCost: 5200, stackable: false, hubs: ['nyc'] },
  { code: 'SKU-COFFEE1K', name: 'Coffee beans 1 kg', description: 'Roasted arabica coffee beans, 1 kg valve bag', category: 'Grocery', hsnCode: '090121', originCountry: 'Philippines', lengthCm: 20, widthCm: 12, heightCm: 8, weightKg: 1.05, unitCost: 890, stackable: true, hubs: ['ord', 'nyc'] },
  { code: 'SKU-BISCUIT', name: 'Butter biscuits, 12-pack', description: 'Butter cookies, 12 × 150 g tins, shrink-wrapped', category: 'Grocery', hsnCode: '190531', originCountry: 'Germany', lengthCm: 30, widthCm: 22, heightCm: 18, weightKg: 2.2, unitCost: 1320, stackable: true, hubs: ['ord'] },
  { code: 'SKU-SHAMPOO', name: 'Shampoo 400 ml, 6-pack', description: 'Anti-dandruff shampoo, 6 × 400 ml bottles', category: 'FMCG', hsnCode: '330510', originCountry: 'Thailand', lengthCm: 24, widthCm: 16, heightCm: 22, weightKg: 2.6, unitCost: 1080, stackable: true, hubs: ['nyc'] },
  { code: 'SKU-DETERG', name: 'Laundry detergent 3 kg', description: 'Powder laundry detergent, 3 kg carton', category: 'FMCG', hsnCode: '340220', originCountry: 'India', lengthCm: 30, widthCm: 12, heightCm: 25, weightKg: 3.1, unitCost: 640, stackable: true, hubs: ['ord'] },
  { code: 'SKU-PARA500', name: 'Paracetamol 500 mg, 100 tabs', description: 'Paracetamol 500 mg tablets, box of 10 × 10 blister strips', category: 'Pharma', hsnCode: '30049099', originCountry: 'India', lengthCm: 12, widthCm: 8, heightCm: 6, weightKg: 0.15, unitCost: 180, stackable: true, hubs: ['ord', 'nyc'] },
  { code: 'SKU-VITC', name: 'Vitamin C 1000 mg, 60 tabs', description: 'Vitamin C effervescent tablets, tube of 60', category: 'Pharma', hsnCode: '300450', originCountry: 'USA', lengthCm: 15, widthCm: 4, heightCm: 4, weightKg: 0.2, unitCost: 420, stackable: true, hubs: ['nyc'] },
  { code: 'SKU-DOCS-A4', name: 'Document envelope, A4', description: 'Contract documents in an A4 courier envelope', category: 'Documents', hsnCode: '490199', originCountry: 'Philippines', lengthCm: 35, widthCm: 25, heightCm: 1, weightKg: 0.3, unitCost: 0, stackable: true, hubs: ['ord', 'nyc'] },
  { code: 'SKU-SAMPLEKIT', name: 'Sample kit', description: 'Marketing sample kit — brochures and product samples', category: 'Marketing', hsnCode: '491199', originCountry: 'Philippines', lengthCm: 30, widthCm: 20, heightCm: 15, weightKg: 2.4, unitCost: 250, stackable: true, hubs: ['ord'] },
]
