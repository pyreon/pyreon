import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'

/**
 * Styled components for the Forms Wizard section.
 *
 * Same convention as the rest of the app:
 *   • Raw HTML elements    → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components → extend via the rocketstyle chain
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const WizardPage = styled('div')`
  padding: 32px 40px;
  max-width: 720px;
`

export const WizardTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const WizardLead = Paragraph.theme((theme) => ({
  marginBottom: 24,
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Stepper ─────────────────────────────────────────────────────────
export const Stepper = styled('ol')`
  list-style: none;
  display: flex;
  gap: 0;
  padding: 0;
  margin: 0 0 32px 0;
  position: relative;
`

export const StepperItem = styled('li')<{ $state: 'done' | 'current' | 'upcoming' }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 14px;
    left: -50%;
    right: 50%;
    height: 2px;
    background: ${(p) =>
      p.$state === 'done' ? t(p).color.system.primary.base : t(p).color.system.base[200]};
    z-index: 0;
  }

  &:first-child::before {
    display: none;
  }
`

export const StepBubble = styled('div')<{ $state: 'done' | 'current' | 'upcoming' }>`
  width: 28px;
  height: 28px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  position: relative;
  z-index: 1;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'done':
        return theme.color.system.primary.base
      case 'current':
        return theme.color.system.primary[100]
      case 'upcoming':
        return theme.color.system.base[100]
    }
  }};
  color: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'done':
        return theme.color.system.light.base
      case 'current':
        return theme.color.system.primary.text
      case 'upcoming':
        return theme.color.system.dark[400]
    }
  }};
  border: 2px solid
    ${(p) => {
      const theme = t(p)
      switch (p.$state) {
        case 'done':
          return theme.color.system.primary.base
        case 'current':
          return theme.color.system.primary[300]
        case 'upcoming':
          return theme.color.system.base[200]
      }
    }};
`

export const StepLabel = styled('span')<{ $state: 'done' | 'current' | 'upcoming' }>`
  font-size: 12px;
  text-align: center;
  color: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'done':
        return theme.color.system.dark[600]
      case 'current':
        return theme.color.system.primary.text
      case 'upcoming':
        return theme.color.system.dark[400]
    }
  }};
  font-weight: ${(p) => (p.$state === 'current' ? t(p).fontWeight.semibold : t(p).fontWeight.base)};
`

// ─── Step card (form panel) ──────────────────────────────────────────
export const StepCard = Card.theme(() => ({
  padding: 32,
  marginBottom: 16,
}))

export const StepHeading = Title.attrs({ tag: 'h2' }).theme((theme) => ({
  marginBottom: 4,
  fontSize: theme.fontSize.large,
}))

export const StepHint = Paragraph.theme((theme) => ({
  marginBottom: 24,
  fontSize: theme.fontSize.small,
  color: theme.color.system.dark[500],
}))

// ─── Form fields ─────────────────────────────────────────────────────
export const FieldGroup = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
`

export const FieldLabel = styled('label')`
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[600]};
`

export const TextInput = styled('input')<{ $invalid?: boolean }>`
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid
    ${(p) =>
      p.$invalid ? t(p).color.system.error.base : t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;
  transition: ${(p) => t(p).transition.fast};

  &:focus {
    border-color: ${(p) =>
      p.$invalid ? t(p).color.system.error.base : t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px
      ${(p) =>
        p.$invalid ? t(p).color.system.error[100] : t(p).color.system.primary[100]};
  }

  &::placeholder {
    color: ${(p) => t(p).color.system.dark[400]};
  }
`

export const SelectInput = styled('select')`
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px ${(p) => t(p).color.system.primary[100]};
  }
`

export const FieldError = styled('span')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.error.text};
  min-height: 14px;
`

export const ToggleRow = styled('label')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: ${(p) => t(p).transition.fast};

  &:hover {
    border-color: ${(p) => t(p).color.system.base[300]};
  }
`

export const ToggleText = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

export const ToggleTitle = styled('span')`
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const ToggleHint = styled('span')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const Checkbox = styled('input')`
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
`

// ─── Navigation buttons ──────────────────────────────────────────────
export const NavBar = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

export const NavBack = styled('button')`
  padding: 10px 18px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[700]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.base[100]};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

export const NavNext = styled('button')`
  padding: 10px 22px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  transition: ${(p) => t(p).transition.fast};

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[800]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Review step ─────────────────────────────────────────────────────
export const ReviewSection = styled('section')`
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};
  padding: 16px 0;

  &:last-of-type {
    border-bottom: none;
  }
`

export const ReviewSectionTitle = styled('h3')`
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(p) => t(p).color.system.dark[400]};
  margin-bottom: 8px;
`

export const ReviewRow = styled('div')`
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: ${(p) => t(p).color.system.dark[700]};
`

export const ReviewLabel = styled('span')`
  color: ${(p) => t(p).color.system.dark[400]};
`

// ─── Patch log (state-tree feature demo) ─────────────────────────────
export const PatchLog = styled('div')`
  padding: 12px 16px;
  background: ${(p) => t(p).color.system.base[50]};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[500]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
`

// ─── Success state ───────────────────────────────────────────────────
export const SuccessCard = Card.theme(() => ({
  padding: 48,
  textAlign: 'center',
}))

export const SuccessIcon = styled('div')`
  width: 56px;
  height: 56px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => t(p).color.system.success[100]};
  color: ${(p) => t(p).color.system.success.text};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin: 0 auto 16px auto;
`

export const SuccessTitle = Title.attrs({ tag: 'h2' }).theme(() => ({
  marginBottom: 8,
}))

export const SuccessText = Paragraph.theme((theme) => ({
  marginBottom: 24,
  color: theme.color.system.dark[500],
}))
