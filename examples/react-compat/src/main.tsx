import { createRoot } from "@pyreon/react-compat/dom"
import App from "./App"

const el = document.getElementById("app")
if (el) createRoot(el).render(<App />)
