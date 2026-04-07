import { Avatar, AvatarGroup } from '@pyreon/ui-components'

export function AvatarDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Avatar</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes (circle)</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Avatar size="xSmall" variant="circle">XS</Avatar>
        <Avatar size="small" variant="circle">SM</Avatar>
        <Avatar size="medium" variant="circle">MD</Avatar>
        <Avatar size="large" variant="circle">LG</Avatar>
        <Avatar size="xLarge" variant="circle">XL</Avatar>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes (rounded)</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Avatar size="xSmall" variant="rounded">XS</Avatar>
        <Avatar size="small" variant="rounded">SM</Avatar>
        <Avatar size="medium" variant="rounded">MD</Avatar>
        <Avatar size="large" variant="rounded">LG</Avatar>
        <Avatar size="xLarge" variant="rounded">XL</Avatar>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Avatar Group</h3>
      <AvatarGroup>
        <Avatar size="medium" variant="circle">AB</Avatar>
        <Avatar size="medium" variant="circle">CD</Avatar>
        <Avatar size="medium" variant="circle">EF</Avatar>
        <Avatar size="medium" variant="circle">GH</Avatar>
        <Avatar size="medium" variant="circle">+3</Avatar>
      </AvatarGroup>
    </div>
  )
}
