import { SidebarRow } from '@tiny/ui'
import { useMatch, useNavigate } from 'react-router'
import { SettingsScreen } from './SettingsScreen'

function SettingsSidebar() {
  const navigate = useNavigate()
  return (
    <SidebarRow
      icon="settings"
      label="Settings"
      active={!!useMatch('/settings')}
      onClick={() => navigate('/settings')}
      data-testid="settings-open"
    />
  )
}

export const settingsPlugin = {
  id: 'settings',
  routes: [{ path: '/settings', element: <SettingsScreen /> }],
  sidebar: SettingsSidebar,
}
