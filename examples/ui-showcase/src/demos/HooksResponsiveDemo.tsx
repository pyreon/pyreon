import { useColorScheme, useMediaQuery, useReducedMotion } from '@pyreon/hooks'
import { Title, Paragraph } from '@pyreon/ui-components'

export function HooksResponsiveDemo() {
  // useColorScheme
  const scheme = useColorScheme()

  // useMediaQuery
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)')
  const isDesktop = useMediaQuery('(min-width: 1025px)')

  // useReducedMotion
  const reducedMotion = useReducedMotion()

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Responsive & Accessibility Hooks</Title>
      <Paragraph style="margin-bottom: 24px">
        Detect OS preferences and viewport size reactively.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">useColorScheme()</Title>
      <p style="margin-bottom: 24px;">
        OS theme: <strong>{() => scheme()}</strong>
      </p>

      <Title size="h3" style="margin-bottom: 12px">useMediaQuery(query)</Title>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px;">
        <p>Mobile (≤ 768px): <strong>{() => String(isMobile())}</strong></p>
        <p>Tablet (769–1024px): <strong>{() => String(isTablet())}</strong></p>
        <p>Desktop (≥ 1025px): <strong>{() => String(isDesktop())}</strong></p>
      </div>

      <Title size="h3" style="margin-bottom: 12px">useReducedMotion()</Title>
      <p style="margin-bottom: 24px;">
        Prefers reduced motion: <strong>{() => String(reducedMotion())}</strong>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Toggle "Reduce motion" in your OS accessibility settings to see this change.
      </p>
    </div>
  )
}
