import { useNavigate } from 'react-router-dom'

export function TopNavbar() {
  const navigate = useNavigate()

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center"
      style={{
        height: '48px',
        background: '#ffffff',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        paddingLeft: '20px',
        paddingRight: '20px',
      }}
    >
      <div className="flex items-center gap-0">
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
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#1d1d1f',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          Prior Auth Agent
        </span>

        <nav className="hidden md:flex items-center gap-6 ml-8">
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#86868b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              letterSpacing: '-0.008em',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#1d1d1f' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
          >
            Cases
          </button>
          <button
            onClick={() => navigate('/analytics')}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#86868b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              letterSpacing: '-0.008em',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#1d1d1f' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
          >
            Analytics
          </button>
        </nav>
      </div>
    </header>
  )
}

export default TopNavbar
