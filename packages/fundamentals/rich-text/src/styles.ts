/**
 * The default placeholder rule. Injected once as
 * `<style data-pyreon-rich-text-placeholder>` when an editor with a
 * `placeholder` mounts, unless `injectStyles: false`. The same rule ships as
 * `@pyreon/rich-text/styles.css` (locked equal by a test) for apps whose CSP
 * refuses inline `<style>` elements.
 */
export const placeholderStyles =
  '.ProseMirror .is-editor-empty:first-child::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:#9ca3af}'
