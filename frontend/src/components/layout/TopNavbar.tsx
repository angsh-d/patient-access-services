import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown } from 'lucide-react'

export function TopNavbar() {
  const navigate = useNavigate()

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{
        height: '48px',
        background: '#ffffff',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        paddingLeft: '20px',
        paddingRight: '20px',
      }}
    >
      {/* Left: Logo + Platform Name */}
      <div className="flex items-center gap-0 flex-shrink-0">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <img
            src="/saama_logo.svg"
            alt="Saama"
            style={{ height: '24px', width: 'auto' }}
          />
        </button>

        <div
          style={{
            width: '1px',
            height: '20px',
            background: 'rgba(0, 0, 0, 0.15)',
            marginLeft: '16px',
            marginRight: '16px',
            flexShrink: 0,
          }}
        />

        <span
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/') }}
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#1d1d1f',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          Digital Patient Services Platform
        </span>
      </div>

      {/* Center: Search Bar */}
      <div className="hidden md:flex items-center flex-1 max-w-lg mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-grey-400" />
          <input
            type="text"
            placeholder="Search cases, patients, or medications..."
            className="w-full h-8 pl-9 pr-3 rounded-lg text-sm border focus:outline-none focus:border-grey-400 transition"
            style={{
              borderColor: 'rgba(0, 0, 0, 0.12)',
              background: '#fafafa',
              color: '#1d1d1f',
              letterSpacing: '-0.006em',
            }}
          />
        </div>
      </div>

      {/* Right: User Avatar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-grey-100 transition"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{ background: '#032D60' }}
          >
            AD
          </div>
          <span
            className="hidden lg:inline text-sm font-medium"
            style={{ color: '#1d1d1f', letterSpacing: '-0.008em', whiteSpace: 'nowrap' }}
          >
            Angshuman Deb
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-grey-400" />
        </button>
      </div>
    </header>
  )
}

export default TopNavbar
