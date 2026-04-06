import { signal } from '@pyreon/reactivity'
import { PinInput } from '@pyreon/ui-components'

export function PinInputDemo() {
  const pin4 = signal('')
  const pin6 = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">PinInput</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        PIN/OTP code input with configurable length and sizes.
      </p>

      {/* 4-digit */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">4-Digit PIN</h3>
      <div style="margin-bottom: 32px;">
        <PinInput style="display: flex; gap: 8px;">
          {[0, 1, 2, 3].map(() => (
            <input
              type="text"
              maxLength={1}
              style="width: 48px; height: 48px; text-align: center; font-size: 20px; border: 1px solid #d1d5db; border-radius: 8px; outline: none;"
              onFocus={(e: FocusEvent) => (e.target as HTMLInputElement).select()}
              onInput={(e: Event) => {
                const input = e.target as HTMLInputElement
                if (input.value && input.nextElementSibling) {
                  (input.nextElementSibling as HTMLInputElement).focus()
                }
              }}
            />
          ))}
        </PinInput>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">Enter your 4-digit verification code</p>
      </div>

      {/* 6-digit */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">6-Digit OTP</h3>
      <div style="margin-bottom: 32px;">
        <PinInput style="display: flex; gap: 8px;">
          {[0, 1, 2, 3, 4, 5].map((_, i) => (
            <input
              type="text"
              maxLength={1}
              style={`width: 44px; height: 44px; text-align: center; font-size: 18px; border: 1px solid #d1d5db; border-radius: 8px; outline: none;${i === 2 ? ' margin-right: 8px;' : ''}`}
              onFocus={(e: FocusEvent) => (e.target as HTMLInputElement).select()}
              onInput={(e: Event) => {
                const input = e.target as HTMLInputElement
                if (input.value && input.nextElementSibling) {
                  (input.nextElementSibling as HTMLInputElement).focus()
                }
              }}
            />
          ))}
        </PinInput>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">6-digit code with separator</p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</p>
          <PinInput size="sm" style="display: flex; gap: 6px;">
            {[0, 1, 2, 3].map(() => (
              <input
                type="text"
                maxLength={1}
                style="width: 36px; height: 36px; text-align: center; font-size: 14px; border: 1px solid #d1d5db; border-radius: 6px; outline: none;"
              />
            ))}
          </PinInput>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</p>
          <PinInput size="md" style="display: flex; gap: 8px;">
            {[0, 1, 2, 3].map(() => (
              <input
                type="text"
                maxLength={1}
                style="width: 48px; height: 48px; text-align: center; font-size: 18px; border: 1px solid #d1d5db; border-radius: 8px; outline: none;"
              />
            ))}
          </PinInput>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</p>
          <PinInput size="lg" style="display: flex; gap: 10px;">
            {[0, 1, 2, 3].map(() => (
              <input
                type="text"
                maxLength={1}
                style="width: 56px; height: 56px; text-align: center; font-size: 22px; border: 1px solid #d1d5db; border-radius: 8px; outline: none;"
              />
            ))}
          </PinInput>
        </div>
      </div>

      {/* Masked */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Masked (Password Style)</h3>
      <div style="margin-bottom: 32px;">
        <PinInput style="display: flex; gap: 8px;">
          {[0, 1, 2, 3].map(() => (
            <input
              type="password"
              maxLength={1}
              style="width: 48px; height: 48px; text-align: center; font-size: 20px; border: 1px solid #d1d5db; border-radius: 8px; outline: none;"
            />
          ))}
        </PinInput>
      </div>
    </div>
  )
}
