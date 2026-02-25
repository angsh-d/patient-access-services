import { useNavigate } from 'react-router-dom'
import {
  Shield, ChevronDown, ChevronRight, Search,
  Settings2, LayoutGrid, RefreshCw, ArrowUpDown,
  Pencil, Paintbrush, Filter, Printer, Tag, Trash2
} from 'lucide-react'

interface SalesforcePageHeaderProps {
  caseCount: number
  lastUpdated: string
  onRefresh: () => void
  searchTerm: string
  onSearchChange: (value: string) => void
  selectedCount?: number
  onDeleteSelected?: () => void
}

export function SalesforcePageHeader({
  caseCount,
  lastUpdated,
  onRefresh,
  searchTerm,
  onSearchChange,
  selectedCount = 0,
  onDeleteSelected,
}: SalesforcePageHeaderProps) {
  const navigate = useNavigate()

  const toolbarIcons: { icon: typeof Settings2; title: string; onClick?: () => void }[] = [
    { icon: Settings2, title: 'Table settings' },
    { icon: LayoutGrid, title: 'View options' },
    { icon: RefreshCw, title: 'Refresh', onClick: onRefresh },
    { icon: ArrowUpDown, title: 'Sort' },
    { icon: Pencil, title: 'Inline edit' },
    { icon: Paintbrush, title: 'Format' },
    { icon: Filter, title: 'Filter' },
  ]

  return (
    <div className="bg-white border-b" style={{ borderColor: '#E5E5E5' }}>
      {/* Breadcrumb + Title Row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-xs text-salesforce-textSecondary">Cases</span>
          <ChevronRight className="w-3 h-3 text-salesforce-textSecondary" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-salesforce-blue" />
            <h1 className="text-lg font-bold" style={{ color: '#181818', letterSpacing: '-0.02em' }}>
              Infliximab Referral Pool
            </h1>
            <ChevronDown className="w-4 h-4 text-salesforce-textSecondary cursor-pointer" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/cases/new')}
              className="h-7 px-3 rounded text-xs font-medium text-white transition-colors"
              style={{ background: '#0176D3' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#014486' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0176D3' }}
            >
              New
            </button>
            <button className="h-7 px-3 rounded text-xs font-medium border transition-colors" style={{ color: '#0176D3', borderColor: '#0176D3' }}>
              Change Owner
            </button>
            <button className="h-7 px-3 rounded text-xs font-medium border transition-colors flex items-center gap-1" style={{ color: '#0176D3', borderColor: '#0176D3' }}>
              <Printer className="w-3 h-3" />
              Printable View
            </button>
            <button className="h-7 px-3 rounded text-xs font-medium border transition-colors flex items-center gap-1" style={{ color: '#0176D3', borderColor: '#0176D3' }}>
              <Tag className="w-3 h-3" />
              Assign Label
            </button>
          </div>
        </div>

        <p className="text-xs mt-1" style={{ color: '#706E6B' }}>
          {caseCount} items &middot; Sorted by Case Number &middot; Filtered by Medication &middot; Updated {lastUpdated}
        </p>
      </div>

      {/* Toolbar Row */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t" style={{ borderColor: '#E5E5E5', background: '#FAFAF9' }}>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-salesforce-textSecondary" />
            <input
              type="text"
              placeholder="Search this list..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-6 pl-6 pr-2 rounded text-xs border focus:outline-none focus:border-salesforce-blue transition"
              style={{ borderColor: '#E5E5E5', width: '180px' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {toolbarIcons.map(({ icon: Icon, title, onClick }, i) => (
            <button
              key={i}
              title={title}
              onClick={onClick}
              className="p-1.5 rounded hover:bg-black/5 transition"
            >
              <Icon className="w-3.5 h-3.5 text-salesforce-textSecondary" />
            </button>
          ))}

          {/* Divider before delete */}
          <div className="w-px h-4 mx-1" style={{ background: '#E5E5E5' }} />

          {/* Delete icon — active when rows selected */}
          <button
            title={selectedCount > 0 ? `Delete ${selectedCount} selected` : 'Select rows to delete'}
            onClick={selectedCount > 0 ? onDeleteSelected : undefined}
            className="relative p-1.5 rounded transition"
            style={{
              cursor: selectedCount > 0 ? 'pointer' : 'default',
              opacity: selectedCount > 0 ? 1 : 0.35,
            }}
            onMouseEnter={(e) => { if (selectedCount > 0) e.currentTarget.style.background = 'rgba(234,0,30,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Trash2
              className="w-3.5 h-3.5"
              style={{ color: selectedCount > 0 ? '#EA001E' : '#706E6B' }}
            />
            {selectedCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none px-0.5"
                style={{ background: '#EA001E' }}
              >
                {selectedCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
