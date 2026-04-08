import { z } from 'zod'

/**
 * Per-step Zod schemas. The wizard advances one step at a time, so each
 * schema validates only its own field set. The combined `WizardData`
 * type is the intersection of all four — that's what the state-tree
 * model stores.
 */

export const accountSchema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })

export const profileSchema = z.object({
  fullName: z.string().min(2, 'Required'),
  jobTitle: z.string().min(2, 'Required'),
  companySize: z.enum(['just-me', 'small', 'medium', 'large', 'enterprise']),
})

export const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  notificationsEmail: z.boolean(),
  notificationsPush: z.boolean(),
  weeklyDigest: z.boolean(),
})

export type AccountValues = z.infer<typeof accountSchema>
export type ProfileValues = z.infer<typeof profileSchema>
export type PreferencesValues = z.infer<typeof preferencesSchema>

/** Combined snapshot stored across the entire wizard. */
export interface WizardSnapshot {
  account: AccountValues
  profile: ProfileValues
  preferences: PreferencesValues
}

/** Default values used to seed the state-tree on first mount. */
export const DEFAULT_WIZARD: WizardSnapshot = {
  account: { email: '', password: '', confirmPassword: '' },
  profile: { fullName: '', jobTitle: '', companySize: 'just-me' },
  preferences: {
    theme: 'system',
    notificationsEmail: true,
    notificationsPush: false,
    weeklyDigest: true,
  },
}

/** Display label for a `companySize` enum value. */
export const COMPANY_SIZE_LABELS: Record<ProfileValues['companySize'], string> = {
  'just-me': 'Just me',
  small: 'Small (2–10)',
  medium: 'Medium (11–50)',
  large: 'Large (51–500)',
  enterprise: 'Enterprise (500+)',
}

/** Display label for a `theme` enum value. */
export const THEME_LABELS: Record<PreferencesValues['theme'], string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match system',
}
