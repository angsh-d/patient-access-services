import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Monitor, Moon, Sun, RefreshCw, Database } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle, CardContent, Select, Badge } from '@/components/ui'

type Theme = 'light' | 'dark' | 'system'

export function Settings() {
  const [theme, setTheme] = useState<Theme>('light')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState('30')

  return (
    <div className="min-h-screen">
      <Header
        title="Settings"
        subtitle="Configure your preferences"
      />

      <div className="p-8 max-w-3xl mx-auto space-y-6">
        {/* Appearance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card variant="default" padding="md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-grey-400" />
                <CardTitle>Appearance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-grey-700 mb-2 block">
                  Theme
                </label>
                <div className="flex gap-3">
                  <ThemeButton
                    theme="light"
                    currentTheme={theme}
                    onClick={() => setTheme('light')}
                    icon={<Sun className="w-4 h-4" />}
                    label="Light"
                  />
                  <ThemeButton
                    theme="dark"
                    currentTheme={theme}
                    onClick={() => setTheme('dark')}
                    icon={<Moon className="w-4 h-4" />}
                    label="Dark"
                  />
                  <ThemeButton
                    theme="system"
                    currentTheme={theme}
                    onClick={() => setTheme('system')}
                    icon={<Monitor className="w-4 h-4" />}
                    label="System"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Refresh */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card variant="default" padding="md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-grey-400" />
                <CardTitle>Data Refresh</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-grey-700">Auto-refresh</p>
                  <p className="text-xs text-grey-500">
                    Automatically refresh case data
                  </p>
                </div>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${
                    autoRefresh ? 'bg-grey-900' : 'bg-grey-300'
                  }`}
                >
                  <motion.div
                    className="w-5 h-5 bg-white rounded-full shadow-sm"
                    animate={{ x: autoRefresh ? 20 : 0 }}
                    transition={{ duration: 0.2 }}
                  />
                </button>
              </div>

              {autoRefresh && (
                <div>
                  <Select
                    label="Refresh interval"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(e.target.value)}
                    options={[
                      { value: '10', label: 'Every 10 seconds' },
                      { value: '30', label: 'Every 30 seconds' },
                      { value: '60', label: 'Every minute' },
                      { value: '300', label: 'Every 5 minutes' },
                    ]}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* System Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card variant="default" padding="md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-grey-400" />
                <CardTitle>System Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="mt-4 space-y-3">
              <InfoRow label="Version" value="1.0.0" />
              <InfoRow label="API Status" value="Connected" badge="success" />
              <InfoRow label="WebSocket" value="Connected" badge="success" />
              <InfoRow label="Environment" value="Demo" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Demo Mode Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="p-4 rounded-2xl bg-semantic-info/10 border border-semantic-info/20">
            <div className="flex items-start gap-3">
              <SettingsIcon className="w-5 h-5 text-semantic-info mt-0.5" />
              <div>
                <p className="text-sm font-medium text-grey-900">Demo Mode</p>
                <p className="text-xs text-grey-600 mt-1">
                  This application is running in demo mode with simulated payer
                  responses. In production, it would integrate with real payer
                  systems and EHR data.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

interface ThemeButtonProps {
  theme: Theme
  currentTheme: Theme
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function ThemeButton({ theme, currentTheme, onClick, icon, label }: ThemeButtonProps) {
  const isActive = theme === currentTheme

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
        isActive
          ? 'bg-grey-900 text-white border-grey-900'
          : 'bg-white text-grey-600 border-grey-200 hover:border-grey-300'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

interface InfoRowProps {
  label: string
  value: string
  badge?: 'success' | 'warning' | 'error'
}

function InfoRow({ label, value, badge }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-grey-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-grey-700">{value}</span>
        {badge && (
          <Badge variant={badge} size="sm" dot />
        )}
      </div>
    </div>
  )
}

export default Settings
