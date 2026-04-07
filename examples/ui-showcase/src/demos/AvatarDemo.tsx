import { Avatar, AvatarGroup, Title } from '@pyreon/ui-components'

export function AvatarDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Avatar</Title>

      <Title size="h3" style="margin-bottom: 12px">Sizes (circle)</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Avatar size="xSmall" variant="circle">XS</Avatar>
        <Avatar size="small" variant="circle">SM</Avatar>
        <Avatar size="medium" variant="circle">MD</Avatar>
        <Avatar size="large" variant="circle">LG</Avatar>
        <Avatar size="xLarge" variant="circle">XL</Avatar>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes (rounded)</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Avatar size="xSmall" variant="rounded">XS</Avatar>
        <Avatar size="small" variant="rounded">SM</Avatar>
        <Avatar size="medium" variant="rounded">MD</Avatar>
        <Avatar size="large" variant="rounded">LG</Avatar>
        <Avatar size="xLarge" variant="rounded">XL</Avatar>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Avatar Group</Title>
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
