/**
 * Store Front masters — live on /master/api/v1 (schemas probed 2026-08-27).
 *
 * Merchant = the `businessUnit` entity on the generic engine. Staging's own
 * page (bundle chunk 18702) confirms: POST businessUnit/fetch with
 * query/dynamicQuery, excel bulk download + "Bulk Add - Merchants" upload,
 * filter dimensions name/code/status, and a flat single-card form whose
 * required fields are name, code, contactPerson, email, addressLine1,
 * postalCode, country (contactNumber validated as +? 8-15 digits, logo
 * captured as a URL). isDefault + numberOfReattempts exist on the schema and
 * the excel template but not staging's form — we keep both editable here.
 * Staging's 18-column dump of every field is layout we deliberately do NOT
 * copy (see CLAUDE.md): the list below is the scannable Branch-style grammar.
 */
import { Building2, MapPin, Phone, SlidersHorizontal } from 'lucide-react'
import type { LiveMasterConfig } from '../LiveMaster'
import { StatusPill } from '../components'
import type { MasterRecord } from '../settingsApi'

const s = (v: unknown) => String(v ?? '').trim()

export const STOREFRONT_MASTERS: Record<string, LiveMasterConfig> = {
  'merchant-listing': {
    entity: 'businessUnit', title: 'Merchant', noun: 'merchant',
    subtitle: 'The merchants fulfilling through your network and their delivery preferences',
    catPath: '/console/settings/masters/store_front',
    titleKey: 'name',
    columns: [
      // identity merged: logo + bold name (+ Default pill) with the code beneath
      { key: 'name', label: 'Merchant', render: (r: MasterRecord) => (
        <div className="flex items-center gap-2.5">
          {s(r.logo) && (
            <img src={s(r.logo)} alt="" className="h-7 w-7 shrink-0 rounded border border-line bg-surface object-contain" />
          )}
          <div>
            <p className="flex items-center gap-1.5 font-bold text-brand-500">
              {s(r.name)}
              {r.isDefault ? <StatusPill label="Default" tone="info" /> : null}
            </p>
            <p className="text-[12px] text-ink-3">{s(r.code)}</p>
          </div>
        </div>
      ) },
      { key: 'contact', label: 'Contact', render: (r: MasterRecord) => (s(r.contactPerson) || s(r.contactNumber)) ? (
        <div>
          <p>{s(r.contactPerson) || '—'}</p>
          {s(r.contactNumber) && <p className="text-[12px] text-ink-3">{s(r.contactNumber)}</p>}
        </div>
      ) : '—' },
      { key: 'email', label: 'Email', render: (r: MasterRecord) => s(r.email) || '—' },
      // street on top, locality muted beneath (Branch address cell)
      { key: 'place', label: 'Address', render: (r: MasterRecord) => {
        const line1 = s(r.addressLine1)
        const rest = [r.city, r.state, r.postalCode, r.country].map(s).filter(Boolean)
        if (!line1 && rest.length === 0) return '—'
        const primary = line1 || rest.shift()
        return (
          <div>
            <p>{primary}</p>
            {rest.length > 0 && <p className="text-[12px] text-ink-3">{rest.join(', ')}</p>}
          </div>
        )
      } },
      { key: 'numberOfReattempts', label: 'Reattempts', render: (r: MasterRecord) =>
        r.numberOfReattempts == null ? '—' : String(r.numberOfReattempts) },
      { key: 'generateReturnLabel', label: 'Return Label', render: (r: MasterRecord) => r.generateReturnLabel ? 'Yes' : '—' },
      // staging's websiteUrl / policyUrl / contactFormUrl columns, merged
      { key: 'links', label: 'Links', render: (r: MasterRecord) => {
        const links = [
          { label: 'Website', url: s(r.websiteUrl) },
          { label: 'Policy', url: s(r.policyUrl) },
          { label: 'Contact', url: s(r.contactFormUrl) },
        ].filter((l) => l.url)
        return links.length ? (
          <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
            {links.map((l) => (
              <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12px] font-bold text-brand-500 hover:underline">{l.label}</a>
            ))}
          </span>
        ) : '—'
      } },
    ],
    fields: [
      // staging requires: name, code, contactPerson, email, addressLine1, postalCode, country
      { key: 'name', label: 'Merchant Name', type: 'text', required: true, placeholder: 'eg, Bluebird Electronics Inc', section: 'Merchant Details' },
      { key: 'code', label: 'Merchant Code', type: 'text', required: true, placeholder: 'eg, BLUEBIRD', section: 'Merchant Details' },
      // staging captures the logo as a URL (its file upload is disabled)
      { key: 'logo', label: 'Logo URL', type: 'text', placeholder: 'eg, https://…/logo.png', section: 'Merchant Details' },
      { key: 'isDefault', label: 'Default Merchant', type: 'toggle', section: 'Merchant Details' },
      { key: 'contactPerson', label: 'Contact Person', type: 'text', required: true, section: 'Contact' },
      // staging validates +? followed by 8-15 digits
      { key: 'contactNumber', label: 'Contact Number', type: 'text', placeholder: 'eg, +13055550142', section: 'Contact' },
      { key: 'email', label: 'Email ID', type: 'text', required: true, placeholder: 'eg, ops@merchant.com', section: 'Contact' },
      { key: 'websiteUrl', label: 'Website URL', type: 'text', placeholder: 'eg, https://…', section: 'Contact' },
      { key: 'addressLine1', label: 'Address Line 1', type: 'text', required: true, section: 'Address' },
      { key: 'addressLine2', label: 'Address Line 2', type: 'text', section: 'Address' },
      { key: 'addressLine3', label: 'Address Line 3', type: 'text', section: 'Address' },
      { key: 'suburb', label: 'Suburb', type: 'text', section: 'Address' },
      { key: 'city', label: 'City', type: 'text', section: 'Address' },
      { key: 'state', label: 'State', type: 'text', section: 'Address' },
      { key: 'postalCode', label: 'Postal Code', type: 'text', required: true, section: 'Address' },
      // staging's merchant form keeps Country as free text (no select source)
      { key: 'country', label: 'Country', type: 'text', required: true, section: 'Address' },
      { key: 'numberOfReattempts', label: 'Number of Reattempts', type: 'number', placeholder: 'eg, 2', init: 0, section: 'Preferences' },
      { key: 'generateReturnLabel', label: 'Generate Return Label', type: 'toggle', section: 'Preferences' },
      { key: 'policyUrl', label: 'Policy URL', type: 'text', placeholder: 'eg, https://…/returns-policy', section: 'Preferences' },
      { key: 'contactFormUrl', label: 'Contact Form URL', type: 'text', placeholder: 'eg, https://…/contact', section: 'Preferences' },
    ],
    beforeSave: async (row) => ({
      ...row,
      numberOfReattempts: Number(row.numberOfReattempts) || 0,
      isDefault: !!row.isDefault,
      generateReturnLabel: !!row.generateReturnLabel,
      contactNumber: s(row.contactNumber).replace(/[\s()-]/g, ''),
    }),
    sectionMeta: {
      'Merchant Details': { icon: <Building2 size={15} className="text-brand-500" />, caption: 'Identity and branding shown to customers on tracking pages.' },
      'Contact': { icon: <Phone size={15} className="text-brand-500" />, caption: 'Primary contact and web presence for this merchant.' },
      'Address': { icon: <MapPin size={15} className="text-brand-500" />, caption: 'The merchant’s registered business address.' },
      'Preferences': { icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Delivery reattempts, return labels and customer-facing links.' },
    },
    searchKeys: ['code', 'name', 'contactPerson', 'email', 'city', 'country'],
    // staging's exact filter dimensions: Merchant Name / Code / Status
    filterKeys: [
      { key: 'name', label: 'Merchant Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
  },
}
