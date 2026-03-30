import { mount } from "@pyreon/runtime-dom";
import App from "./App";

const el = document.getElementById("app");
if (el) mount(App, el);
