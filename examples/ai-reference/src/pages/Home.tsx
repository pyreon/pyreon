/**
 * Static page — minimal component with head management.
 *
 * PATTERN: useHead for document title/meta
 */
import { useHead } from "@pyreon/head";

export const Home = () => {
  useHead({
    title: "Home",
    meta: [{ name: "description", content: "Pyreon AI reference app" }],
  });

  return (
    <div>
      <h1>Pyreon AI Reference</h1>
      <p>Canonical patterns for AI-assisted development.</p>
    </div>
  );
};
