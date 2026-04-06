import { signal } from '@pyreon/reactivity'
import {
  Card,
  Title,
  Paragraph,
  Button,
  Input,
  Checkbox,
  Divider,
  FormField,
  FieldLabel,
  FieldError,
} from '@pyreon/ui-components'

export function LoginFormDemo() {
  const email = signal('')
  const password = signal('')
  const remember = signal(false)
  const submitted = signal(false)
  const loading = signal(false)

  const emailError = () => {
    if (!submitted()) return ''
    if (!email()) return 'Email is required.'
    if (!email().includes('@')) return 'Please enter a valid email address.'
    return ''
  }

  const passwordError = () => {
    if (!submitted()) return ''
    if (!password()) return 'Password is required.'
    if (password().length < 8) return 'Password must be at least 8 characters.'
    return ''
  }

  const handleSubmit = () => {
    submitted.set(true)
    if (!emailError() && !passwordError()) {
      loading.set(true)
      setTimeout(() => loading.set(false), 2000)
    }
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Login Form</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A complete sign-in form composed from Card, Input, Checkbox, Button, Divider, and FormField components.
      </p>

      <div style="max-width: 420px; margin: 0 auto;">
        <Card {...{ variant: 'elevated' } as any}>
          <div style="padding: 8px;">
            {/* Header */}
            <div style="text-align: center; margin-bottom: 24px;">
              <Title {...{ size: 'h3' } as any}>Sign In</Title>
              <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 4px;' } as any}>
                Welcome back! Please enter your credentials.
              </Paragraph>
            </div>

            {/* Email Field */}
            <div style="margin-bottom: 16px;">
              <FormField>
                <FieldLabel>Email address</FieldLabel>
                <Input
                  {...{ state: emailError() ? 'error' : 'default' } as any}
                  type="email"
                  placeholder="you@example.com"
                  value={email()}
                  onInput={(e: Event) => email.set((e.target as HTMLInputElement).value)}
                />
                {() => emailError() ? <FieldError>{emailError()}</FieldError> : null}
              </FormField>
            </div>

            {/* Password Field */}
            <div style="margin-bottom: 16px;">
              <FormField>
                <FieldLabel>Password</FieldLabel>
                <Input
                  {...{ state: passwordError() ? 'error' : 'default' } as any}
                  type="password"
                  placeholder="Enter your password"
                  value={password()}
                  onInput={(e: Event) => password.set((e.target as HTMLInputElement).value)}
                />
                {() => passwordError() ? <FieldError>{passwordError()}</FieldError> : null}
              </FormField>
            </div>

            {/* Remember Me + Forgot Password */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <Checkbox
                  checked={remember()}
                  onChange={() => remember.update((v) => !v)}
                />
                <span style="font-size: 14px; color: #374151;">Remember me</span>
              </div>
              <a
                href="#"
                style="font-size: 14px; color: #3b82f6; text-decoration: none;"
                onClick={(e: Event) => e.preventDefault()}
              >
                Forgot password?
              </a>
            </div>

            {/* Primary Sign In Button */}
            <div style="margin-bottom: 16px;">
              <Button
                {...{ state: 'primary', size: 'md', style: 'width: 100%;' } as any}
                disabled={loading()}
                onClick={handleSubmit}
              >
                {() => loading() ? 'Signing in...' : 'Sign In'}
              </Button>
            </div>

            {/* Divider */}
            <div style="margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="flex: 1;"><Divider /></div>
                <span style="font-size: 12px; color: #9ca3af; text-transform: uppercase;">or</span>
                <div style="flex: 1;"><Divider /></div>
              </div>
            </div>

            {/* Google Sign In */}
            <div style="margin-bottom: 20px;">
              <Button
                {...{ state: 'secondary', variant: 'outline', size: 'md', style: 'width: 100%;' } as any}
              >
                Sign in with Google
              </Button>
            </div>

            {/* Create Account Link */}
            <div style="text-align: center;">
              <Paragraph {...{ size: 'sm' } as any}>
                <span style="color: #6b7280;">Don't have an account? </span>
                <a
                  href="#"
                  style="color: #3b82f6; text-decoration: none; font-weight: 500;"
                  onClick={(e: Event) => e.preventDefault()}
                >
                  Create account
                </a>
              </Paragraph>
            </div>
          </div>
        </Card>
      </div>

      {/* Compact Variant */}
      <div style="max-width: 360px; margin: 32px auto 0;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Compact Variant</h3>
        <Card {...{ variant: 'outline' } as any}>
          <div style="padding: 4px;">
            <Title {...{ size: 'h5', style: 'margin-bottom: 16px;' } as any}>Quick Login</Title>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <Input
                {...{ size: 'sm' } as any}
                type="email"
                placeholder="Email"
              />
              <Input
                {...{ size: 'sm' } as any}
                type="password"
                placeholder="Password"
              />
              <Button {...{ state: 'primary', size: 'sm', style: 'width: 100%;' } as any}>
                Sign In
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
