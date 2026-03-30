import "./style.css";
import { Fragment, h, Show } from "@pyreon/core";
import { batch, computed, effect, signal } from "@pyreon/reactivity";
import { mount } from "@pyreon/runtime-dom";
import { App } from "./App";

// Expose Pyreon modules on window for e2e tests
(window as any).__pyreon = { h, Fragment, Show, mount, signal, computed, effect, batch };

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app element");

mount(<App />, container);
