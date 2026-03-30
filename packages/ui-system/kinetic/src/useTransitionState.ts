import { createRef } from "@pyreon/core";
import { runUntracked, signal, watch } from "@pyreon/reactivity";
import type { TransitionStage, TransitionStateResult } from "./types";

export type UseTransitionState = (options: {
  show: () => boolean;
  appear?: boolean | undefined;
}) => TransitionStateResult;

const useTransitionState: UseTransitionState = ({ show, appear = false }) => {
  const initialShow = show();
  // When appear=true and show starts true, mount the element (stage='entered')
  // but defer the enter animation until the ref is connected.
  const needsAppear = appear && initialShow;
  const stage = signal<TransitionStage>(initialShow ? "entered" : "hidden");
  const elementRef = createRef<HTMLElement>();
  let isInitialMount = true;
  let appearTriggered = false;

  // Ref callback that triggers the appear animation once the element is wired
  const refCallback = (node: HTMLElement | null) => {
    elementRef.current = node;
    if (node && needsAppear && !appearTriggered) {
      appearTriggered = true;
      stage.set("entering");
    }
  };

  watch(
    show,
    (showVal) => {
      if (isInitialMount) {
        isInitialMount = false;
        // appear case is handled by refCallback above
        return;
      }

      const currentStage = runUntracked(() => stage());
      if (showVal && (currentStage === "hidden" || currentStage === "leaving")) {
        stage.set("entering");
      } else if (!showVal && (currentStage === "entered" || currentStage === "entering")) {
        stage.set("leaving");
      }
    },
    { immediate: true },
  );

  const complete = () => {
    const current = stage();
    if (current === "entering") stage.set("entered");
    if (current === "leaving") stage.set("hidden");
  };

  return {
    stage,
    ref: refCallback,
    shouldMount: () => stage() !== "hidden",
    complete,
  };
};

export default useTransitionState;
