import { FadeIn, SlideUp } from "./animations";
import { GhostButton, PrimaryButton } from "./components";
import { addNotification } from "./notifications";
import { Code, FlexRow, SectionTitle } from "./primitives";

export function ModalOverlay(props: { onClose: () => void }) {
  return (
    <FadeIn appear show={() => true}>
      <div
        role="dialog"
        tabIndex={-1}
        style={{
          position: "fixed",
          inset: "0",
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "300",
        }}
        onClick={(e: Event) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") props.onClose();
        }}
      >
        <SlideUp appear show={() => true}>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "480px",
              width: "90vw",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <SectionTitle style={{ fontSize: "20px", marginBottom: "12px" }}>
              Modal Dialog
            </SectionTitle>
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: "8px",
              }}
            >
              This modal uses:
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                marginBottom: "20px",
              }}
            >
              <p>
                <Code>kinetic</Code> — fade + slideUp animations
              </p>
              <p>
                <Code>useScrollLock</Code> — prevents body scroll
              </p>
              <p>
                <Code>useKeyboard</Code> — Escape to close
              </p>
            </div>
            <FlexRow style={{ justifyContent: "flex-end" }}>
              <GhostButton onClick={props.onClose}>
                <span>Cancel</span>
              </GhostButton>
              <PrimaryButton
                onClick={() => {
                  addNotification("Modal confirmed!", "success");
                  props.onClose();
                }}
              >
                <span>Confirm</span>
              </PrimaryButton>
            </FlexRow>
          </div>
        </SlideUp>
      </div>
    </FadeIn>
  );
}
