/**
 * Bulk-upload template generator — staging's sample sheet (214 headers,
 * captured 2026-08-27) minus whatever the Base Modules "Add Form" settings
 * hide. Columns marked * in the sheet are upload-mandatory and are never
 * dropped. The file is a real .xlsx (stored zip + sharedStrings — staging's
 * parser rejects inline-string sheets), so it round-trips through bulk upload.
 */

export const BULK_HEADERS: string[] = ["reference_number*", "order_number*", "consignment_number", "exchange_order_number", "consignment_type", "business_unit", "routing_priority", "routing_type", "consignment_group_id", "tags", "ship_by_date*", "service_type", "pallet_space", "total_weight", "total_weight_uom", "total_volume", "total_volume_uom", "payment_mode", "amount", "currency", "special_instructions", "delivery_instruction", "stackable", "four_person", "four_person_service_time", "fragile", "vip", "hazmat", "heavy_weight", "splittable", "scannable", "attempt_level", "is_hyperlocal", "scheduling_confirmation_required", "clearance_required", "clearance_done", "printer_code", "cost_code", "slot_token", "additional_information", "label_format", "label_size", "label_resolution", "package_id*", "package_tracking_number", "package_type*", "package_value", "package_pallet_space", "package_description", "package_length*", "package_width*", "package_height*", "package_dimension_uom*", "package_weight*", "package_weight_uom*", "package_volume", "package_volume_uom", "package_quantity*", "package_instructions", "package_tags", "package_additional_information", "package_status", "sku_code", "sku_name", "sku_hsn_name", "sku_ean", "sku_quantity", "sku_uom", "sku_unit_price", "sku_unit_price_ex_vat", "sku_value", "sku_weight", "sku_weight_uom", "sku_description", "sku_image_url", "sku_line_item_no", "sku_origin_country", "sku_category", "sku_delivery_service_time", "sku_pickup_service_time", "sku_length", "sku_width", "sku_height", "sku_dimension_uom", "sku_volume", "sku_volume_uom", "sku_stackable", "sku_fragile", "sku_vip", "sku_hazmat", "sku_heavy_weight", "sku_four_person", "sku_return_eligibility", "sku_package_id", "vas_name", "vas_service_time", "vas_added_level", "vas_ids", "vas_remark", "carrier_code", "carrier_name", "ship_from_origin_facility_code", "ship_from_address_type", "ship_from_address_code", "ship_from_contact_name", "ship_from_address_line_1", "ship_from_address_line_2", "ship_from_address_line_3", "ship_from_address_location_name", "ship_from_address_landmark", "ship_from_contact_email", "ship_from_contact_number", "ship_from_contact_company_name", "ship_from_address_city", "ship_from_address_state", "ship_from_address_pincode", "ship_from_address_county", "ship_from_address_country", "ship_from_location_contact_name", "ship_from_location_contact_email", "ship_from_location_contact_number", "ship_from_location_contact_company_name", "ship_from_address_latitude", "ship_from_address_longitude", "ship_from_pickup_start_datetime", "ship_from_pickup_end_datetime", "ship_from_timezone", "ship_to_destination_facility_code", "ship_to_address_type", "ship_to_address_code", "ship_to_contact_name", "ship_to_address_line_1", "ship_to_address_line_2", "ship_to_address_line_3", "ship_to_address_location_name", "ship_to_address_landmark", "ship_to_contact_email", "ship_to_contact_number", "ship_to_contact_company_name", "ship_to_address_city", "ship_to_address_state", "ship_to_address_pincode", "ship_to_address_county", "ship_to_address_country", "ship_to_address_latitude", "ship_to_address_longitude", "ship_to_location_contact_name", "ship_to_location_contact_email", "ship_to_location_contact_number", "ship_to_location_contact_company_name", "ship_to_delivery_start_datetime", "ship_to_delivery_end_datetime", "ship_to_timezone", "bill_to_address_type", "bill_to_address_code", "bill_to_contact_name", "bill_to_address_line_1", "bill_to_address_line_2", "bill_to_address_line_3", "bill_to_address_location_name", "bill_to_address_landmark", "bill_to_contact_email", "bill_to_contact_number", "bill_to_contact_company_name", "bill_to_address_city", "bill_to_address_state", "bill_to_address_pincode", "bill_to_address_county", "bill_to_address_country", "bill_to_address_latitude", "bill_to_address_longitude", "return_to_address_type", "return_to_facility_code", "return_to_address_name", "return_to_address_line_1", "return_to_address_line_2", "return_to_address_line_3", "return_to_address_location_name", "return_to_address_landmark", "return_to_contact_name", "return_to_contact_email", "return_to_contact_number", "return_to_contact_company_name", "return_to_address_city", "return_to_address_state", "return_to_address_pincode", "return_to_address_county", "return_to_address_country", "return_to_address_latitude", "return_to_address_longitude", "shipper_code", "shipper_contact_name", "shipper_contact_email", "shipper_contact_number", "shipper_contact_company_name", "shipper_location_contact_name", "shipper_location_contact_email", "shipper_location_contact_number", "shipper_location_contact_company_name", "shipper_address_code", "shipper_address_type", "shipper_address_line_1", "shipper_address_line_2", "shipper_address_line_3", "shipper_address_location_name", "shipper_address_landmark", "shipper_address_city", "shipper_address_state", "shipper_address_po_box_number", "shipper_address_pincode", "shipper_address_country", "shipper_address_county", "shipper_address_latitude", "shipper_address_longitude"]

/* hidden form field -> the template columns that fall with it (starred
 * columns are filtered back in — never dropped) */
const FIELD_SHEET_COLUMNS: Record<string, string[]> = {
  consignmentNumber: ['consignment_number'],
  exchangeOrderNumber: ['exchange_order_number'],
  tags: ['tags', 'package_tags'],
  serviceType: ['service_type'],
  routingType: ['routing_type', 'routing_priority'],
  labelFormat: ['label_format', 'label_size', 'label_resolution'],
  paymentMode: ['payment_mode', 'amount', 'currency'],
  orderAmount: ['amount', 'currency'],
  specialInstructions: ['special_instructions'],
  deliveryInstructions: ['delivery_instruction'],
  schedulingConfirmation: ['scheduling_confirmation_required'],
  clearanceRequired: ['clearance_required', 'clearance_done'],
  scannable: ['scannable'],
  splittable: ['splittable'],
  addrCompanyName: ['ship_from_contact_company_name', 'ship_to_contact_company_name'],
  addrEmail: ['ship_from_contact_email', 'ship_to_contact_email'],
  addrLines23: ['ship_from_address_line_2', 'ship_from_address_line_3', 'ship_to_address_line_2', 'ship_to_address_line_3'],
  addrLandmark: ['ship_from_address_landmark', 'ship_to_address_landmark'],
  addrSuburb: ['ship_from_address_county', 'ship_to_address_county'],
  addrCoordinates: ['ship_from_address_latitude', 'ship_from_address_longitude', 'ship_to_address_latitude', 'ship_to_address_longitude'],
  addrWindow: ['ship_from_pickup_start_datetime', 'ship_from_pickup_end_datetime', 'ship_to_delivery_start_datetime', 'ship_to_delivery_end_datetime'],
  skuCategory: ['sku_category'],
  skuDescription: ['sku_description'],
  skuHsn: ['sku_hsn_name'],
  skuImage: ['sku_image_url'],
  skuDimensions: ['sku_length', 'sku_width', 'sku_height', 'sku_dimension_uom', 'sku_volume', 'sku_volume_uom'],
  skuWeight: ['sku_weight', 'sku_weight_uom'],
  skuUnitCost: ['sku_unit_price', 'sku_unit_price_ex_vat', 'sku_value'],
  pkgTracking: ['package_tracking_number'],
  pkgPalletSpace: ['package_pallet_space', 'pallet_space'],
  pkgDescription: ['package_description'],
}

export function visibleBulkHeaders(hidden: string[]): string[] {
  const dropped = new Set(hidden.flatMap((k) => FIELD_SHEET_COLUMNS[k] ?? []))
  return BULK_HEADERS.filter((h) => h.endsWith('*') || !dropped.has(h))
}

/* ------------------------- minimal stored-zip xlsx ------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function storeZip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff])
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const p of parts) { out.set(p, o); o += p.length }
    return out
  }
  for (const f of files) {
    const nameB = enc.encode(f.name)
    const dataB = enc.encode(f.data)
    const crc = crc32(dataB)
    const local = cat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dataB.length), u32(dataB.length), u16(nameB.length), u16(0), nameB, dataB)
    chunks.push(local)
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dataB.length), u32(dataB.length), u16(nameB.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameB))
    offset += local.length
  }
  const centralStart = offset
  const centralBlob = cat(...central)
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlob.length), u32(centralStart), u16(0))
  return new Blob([cat(...chunks), centralBlob, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function colRef(i: number): string {
  let n = i + 1, ref = ''
  while (n > 0) { const r = (n - 1) % 26; ref = String.fromCharCode(65 + r) + ref; n = Math.floor((n - 1) / 26) }
  return ref
}

/** the template: one sheet, one header row, sharedStrings-backed */
export function buildBulkTemplate(hidden: string[]): Blob {
  const headers = visibleBulkHeaders(hidden)
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${headers.length}" uniqueCount="${headers.length}">${headers.map((h) => `<si><t>${xmlEscape(h)}</t></si>`).join('')}</sst>`
  const cells = headers.map((_, i) => `<c r="${colRef(i)}1" t="s"><v>${i}</v></c>`).join('')
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="consignments" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
  return storeZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/sharedStrings.xml', data: shared },
  ])
}
