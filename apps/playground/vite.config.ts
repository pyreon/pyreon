import { defineConfig } from "vite"
import nova from "@pyreon/vite-plugin"

export default defineConfig({
  plugins: [nova()],
  resolve: {
    conditions: ["bun"],
  },
})
