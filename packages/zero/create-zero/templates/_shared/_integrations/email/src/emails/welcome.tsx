import {
  DocDocument,
  DocPage,
  DocSection,
  DocHeading,
  DocText,
  DocSpacer,
} from '@pyreon/document-primitives'

export interface WelcomeEmailProps {
  name: string
  appUrl: string
}

/**
 * Welcome email template. Renders in the browser AND exports to email
 * HTML via `@pyreon/document-primitives` — the SAME component tree.
 *
 * Try it: in dev, visit `/api/email/welcome?to=you@example.com`. In
 * production, call `sendEmail({ to, subject, template: WelcomeEmail,
 * data: { name, appUrl } })` from any server route.
 */
export default function WelcomeEmail(props: WelcomeEmailProps) {
  return (
    <DocDocument title="Welcome" subject="Welcome to your new account">
      <DocPage>
        <DocSection>
          <DocHeading level="h1">Welcome, {props.name}.</DocHeading>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocText>
            Your account is ready. The dashboard is the fastest way to get started — log
            in any time at:
          </DocText>
          <DocText>{props.appUrl}</DocText>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocText>If you didn't create this account, ignore this email.</DocText>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}
