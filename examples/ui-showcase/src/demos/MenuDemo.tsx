import { Menu, MenuItem, Divider } from '@pyreon/ui-components'

export function MenuDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Menu</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Dropdown menus with items, dividers, and icons for contextual actions.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Menu</h3>
      <div style="margin-bottom: 24px;">
        <Menu style="width: 200px;">
          <MenuItem>Profile</MenuItem>
          <MenuItem>Settings</MenuItem>
          <MenuItem>Help</MenuItem>
        </Menu>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Dividers</h3>
      <div style="margin-bottom: 24px;">
        <Menu style="width: 220px;">
          <MenuItem>New File</MenuItem>
          <MenuItem>New Folder</MenuItem>
          <Divider />
          <MenuItem>Import</MenuItem>
          <MenuItem>Export</MenuItem>
          <Divider />
          <MenuItem style="color: #ef4444;">Delete</MenuItem>
        </Menu>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Icons</h3>
      <div style="margin-bottom: 24px;">
        <Menu style="width: 240px;">
          <MenuItem>
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">+</span> New Project
            </span>
          </MenuItem>
          <MenuItem>
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">*</span> Starred
            </span>
          </MenuItem>
          <MenuItem>
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">@</span> Team Members
            </span>
          </MenuItem>
          <Divider />
          <MenuItem>
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">#</span> Settings
            </span>
          </MenuItem>
        </Menu>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Keyboard Shortcuts</h3>
      <div style="margin-bottom: 24px;">
        <Menu style="width: 260px;">
          <MenuItem>
            <span style="display: flex; justify-content: space-between; width: 100%;">
              <span>Undo</span>
              <span style="color: #9ca3af; font-size: 12px;">Ctrl+Z</span>
            </span>
          </MenuItem>
          <MenuItem>
            <span style="display: flex; justify-content: space-between; width: 100%;">
              <span>Redo</span>
              <span style="color: #9ca3af; font-size: 12px;">Ctrl+Shift+Z</span>
            </span>
          </MenuItem>
          <Divider />
          <MenuItem>
            <span style="display: flex; justify-content: space-between; width: 100%;">
              <span>Cut</span>
              <span style="color: #9ca3af; font-size: 12px;">Ctrl+X</span>
            </span>
          </MenuItem>
          <MenuItem>
            <span style="display: flex; justify-content: space-between; width: 100%;">
              <span>Copy</span>
              <span style="color: #9ca3af; font-size: 12px;">Ctrl+C</span>
            </span>
          </MenuItem>
          <MenuItem>
            <span style="display: flex; justify-content: space-between; width: 100%;">
              <span>Paste</span>
              <span style="color: #9ca3af; font-size: 12px;">Ctrl+V</span>
            </span>
          </MenuItem>
        </Menu>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">User Account Menu</h3>
      <div style="margin-bottom: 24px;">
        <Menu style="width: 240px;">
          <div style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; margin-bottom: 4px;">
            <p style="font-weight: 600; font-size: 14px;">Jane Doe</p>
            <p style="font-size: 12px; color: #6b7280;">jane@example.com</p>
          </div>
          <MenuItem>My Profile</MenuItem>
          <MenuItem>Account Settings</MenuItem>
          <MenuItem>Billing</MenuItem>
          <Divider />
          <MenuItem>Help Center</MenuItem>
          <MenuItem>Keyboard Shortcuts</MenuItem>
          <Divider />
          <MenuItem style="color: #ef4444;">Sign Out</MenuItem>
        </Menu>
      </div>
    </div>
  )
}
