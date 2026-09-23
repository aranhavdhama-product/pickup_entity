/** Landing spot for sidebar entries that have no page yet — the header already names the route. */
export default function ComingSoon() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-sm">This module isn’t built yet — pick another item from the sidebar.</p>
      </div>
    </div>
  )
}
