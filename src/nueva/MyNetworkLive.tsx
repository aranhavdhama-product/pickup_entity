/**
 * My Network — the tabs page with ALL THREE tabs live on staging's own APIs:
 *
 *  - Branch            → legacy hub store + master `branch` (full CRUD,
 *                        geofence studio, dual-write)
 *  - Serviceable Areas → /master/api/v2/branch/serviceableArea (create +
 *                        append-only update + enable/disable)
 *  - Zone Master       → /master/api/v2/branch/zoneMaster (list, view
 *                        assignments, add zone configuration)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Tabs } from './components'
import LiveMaster from './LiveMaster'
import { BRANCH_CFG, SERVICEABLE_AREA_CFG } from './liveMasterConfigs'
import ZoneMasterTab from './ZoneMaster'

const TAB_CFGS = [
  { title: 'Branch', cfg: BRANCH_CFG },
  { title: 'Serviceable Areas', cfg: SERVICEABLE_AREA_CFG },
]

export default function MyNetworkLive() {
  const nav = useNavigate()
  const [tab, setTab] = useState(0)
  // hide the page chrome while an embedded view/add/edit sub-page is open
  const [subpage, setSubpage] = useState(false)

  return (
    <div>
      {!subpage && <>
        <PageHeader title="My Network" subtitle="Manage branches and serviceable areas. Add, edit or pause"
          onBack={() => nav('/console/settings/masters/network_location')} />
        <Tabs tabs={['Branch', 'Serviceable Areas', 'Zone Master']} active={tab} onChange={setTab} />
      </>}
      <div className={subpage ? '' : 'mt-4'}>
        {/* key remounts the engine per tab so filters/selection reset cleanly */}
        {tab < 2
          ? <LiveMaster key={TAB_CFGS[tab].title} cfg={TAB_CFGS[tab].cfg} embedded onModeChange={setSubpage} />
          : <ZoneMasterTab key="zones" embedded onModeChange={setSubpage} />}
      </div>
    </div>
  )
}
