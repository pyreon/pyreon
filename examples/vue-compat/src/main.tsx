import { createApp } from "@pyreon/vue-compat";
import App from "./App";

const el = document.getElementById("app");
if (el) createApp(App).mount(el);
