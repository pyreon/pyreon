import { config } from "@pyreon/ui-core"

const { styled, keyframes } = config

export const Page = styled("div")`
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: background 0.3s, color 0.3s;
  padding-bottom: 64px;
`

export const Header = styled("header")`
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--shadow);
  position: sticky;
  top: 0;
  z-index: 100;
`

export const Logo = styled("h1")`
  font-size: 20px;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: -0.5px;
`

export const Section = styled("section")`
  padding: 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
`

export const SectionTitle = styled("h2")`
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text);
`

export const SectionDesc = styled("p")`
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
`

export const Card = styled("div")`
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s, transform 0.2s;
`

export const Badge = styled("span")`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
`

export const Divider = styled("hr")`
  border: none;
  border-top: 1px solid var(--border);
  margin: 40px 0;
`

export const Code = styled("code")`
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: "SF Mono", Consolas, monospace;
`

export const FlexRow = styled("div")`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
`

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

export const _Spinner = styled("div")`
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: ${spin.toString()} 0.8s linear infinite;
`

export const Btn = styled("button")`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  outline: none;
`
