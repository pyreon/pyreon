import { defineConfig } from "vite"
import pyreon from "@pyreon/vite-plugin"

export default defineConfig({
  plugins: [pyreon()],
  resolve: {
    conditions: ["bun"],
  },
})
