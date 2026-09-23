/** Class strings shared by the console shell (`shell.tsx`) and a portal's own rail footer. */

/** The class of a rail row — exported so a portal's footer rows match exactly. */
export function shellRowClass(active: boolean, collapsed: boolean): string {
  return collapsed
    ? `flex w-full justify-center py-2.5 transition-colors
        ${active ? 'bg-[#FFEDE5] text-[#E84E1B]' : 'text-gray-500 hover:bg-gray-50 hover:text-[#E84E1B]'}`
    : `mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] transition-colors
        ${active
          ? 'bg-[#FFEDE5] font-semibold text-[#E84E1B]'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
}

