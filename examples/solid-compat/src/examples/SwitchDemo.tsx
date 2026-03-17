import { createSignal, Match, Switch } from "solid-js"
import Demo from "./Demo"

export default function SwitchDemo() {
  const [tab, setTab] = createSignal<"home" | "about" | "contact">("home")

  return (
    <Demo
      title="Multi-Branch Conditionals"
      apis="Switch, Match"
      code={`const [tab, setTab] = createSignal("home");

<Switch fallback={<p>Unknown tab</p>}>
  <Match when={() => tab() === "home"}>
    <p>Welcome home!</p>
  </Match>
  <Match when={() => tab() === "about"}>
    <p>About us</p>
  </Match>
</Switch>`}
    >
      <div class="row">
        <button
          type="button"
          class={tab() === "home" ? "selected" : ""}
          onClick={() => setTab("home")}
        >
          Home
        </button>
        <button
          type="button"
          class={tab() === "about" ? "selected" : ""}
          onClick={() => setTab("about")}
        >
          About
        </button>
        <button
          type="button"
          class={tab() === "contact" ? "selected" : ""}
          onClick={() => setTab("contact")}
        >
          Contact
        </button>
      </div>
      <Switch>
        <Match when={() => tab() === "home"}>
          <p>Welcome home!</p>
        </Match>
        <Match when={() => tab() === "about"}>
          <p>Learn more about Pyreon.</p>
        </Match>
        <Match when={() => tab() === "contact"}>
          <p>Get in touch with us.</p>
        </Match>
      </Switch>
    </Demo>
  )
}
