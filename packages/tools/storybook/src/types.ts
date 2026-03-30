import type { ComponentFn, Props, VNodeChild } from "@pyreon/core";

// ─── Storybook Renderer Interface ────────────────────────────────────────────

/**
 * The Pyreon renderer descriptor used by Storybook internally.
 * This tells Storybook what our "component" and "storyResult" types are.
 */
export interface PyreonRenderer {
  component: ComponentFn<any>;
  storyResult: VNodeChild;
  canvasElement: HTMLElement;
}

// ─── Args & ArgTypes ─────────────────────────────────────────────────────────

/** Extract props type from a Pyreon component function. */
export type InferProps<T> = T extends ComponentFn<infer P> ? P : Props;

// ─── Decorator ───────────────────────────────────────────────────────────────

export interface StoryContext<TArgs = Props> {
  args: TArgs;
  argTypes: Record<string, unknown>;
  globals: Record<string, unknown>;
  id: string;
  kind: string;
  name: string;
  viewMode: "story" | "docs";
}

export type StoryFn<TArgs = Props> = (args: TArgs, context: StoryContext<TArgs>) => VNodeChild;

export type DecoratorFn<TArgs = Props> = (
  storyFn: StoryFn<TArgs>,
  context: StoryContext<TArgs>,
) => VNodeChild;

// ─── Meta ────────────────────────────────────────────────────────────────────

export interface Meta<TComponent extends ComponentFn<any> = ComponentFn> {
  /** The component to document. */
  component?: TComponent;
  /** Display title in the sidebar. */
  title?: string;
  /** Decorators applied to every story in this file. */
  decorators?: DecoratorFn<InferProps<TComponent>>[];
  /** Default args for all stories. */
  args?: Partial<InferProps<TComponent>>;
  /** Arg type definitions for Controls panel. */
  argTypes?: Record<string, unknown>;
  /** Story parameters (backgrounds, viewport, etc.). */
  parameters?: Record<string, unknown>;
  /** Tags for filtering (e.g. "autodocs"). */
  tags?: string[];
  /**
   * Default render function. If omitted, the component is called
   * with args as props: `h(component, args)`.
   */
  render?: (
    args: InferProps<TComponent>,
    context: StoryContext<InferProps<TComponent>>,
  ) => VNodeChild;
  /** Exclude arg names from Controls. */
  excludeStories?: string | string[] | RegExp;
  /** Include only these story names. */
  includeStories?: string | string[] | RegExp;
}

// ─── StoryObj ────────────────────────────────────────────────────────────────

export interface StoryObj<TMeta extends Meta<any> = Meta> {
  /** Args for this specific story (merged with meta.args). */
  args?: Partial<MetaArgs<TMeta>>;
  /** Arg type overrides. */
  argTypes?: Record<string, unknown>;
  /** Decorators for this story only. */
  decorators?: DecoratorFn<MetaArgs<TMeta>>[];
  /** Parameters for this story. */
  parameters?: Record<string, unknown>;
  /** Tags for this story. */
  tags?: string[];
  /** Override the render function for this story. */
  render?: (args: MetaArgs<TMeta>, context: StoryContext<MetaArgs<TMeta>>) => VNodeChild;
  /** Story name override. */
  name?: string;
  /** Play function for interaction tests. */
  play?: (context: {
    canvasElement: HTMLElement;
    args: MetaArgs<TMeta>;
    step: (name: string, fn: () => Promise<void>) => Promise<void>;
  }) => Promise<void> | void;
}

/** Extract the args type from a Meta definition. */
type MetaArgs<TMeta> = TMeta extends Meta<infer C> ? InferProps<C> : Props;
